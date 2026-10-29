import Fastify, { type FastifyInstance, type FastifyBaseLogger } from "fastify";
import { timingSafeEqual } from "node:crypto";
import {
  checkDatabase,
  getConversation,
  listAssets,
  listContacts,
  listConversations,
  listGenerationJobs,
  listTenants,
} from "@intelli-wha/db";
import { logger } from "@intelli-wha/logger";

export function buildApp(
  options: { adminToken?: string } = {},
): FastifyInstance {
  const app = Fastify({ loggerInstance: logger as FastifyBaseLogger });
  const token = options.adminToken?.trim();

  app.get("/health", async () => ({
    ok: true,
    service: "intelli-wha-api",
  }));

  app.get("/health/db", async () => ({
    ok: await checkDatabase(),
    service: "intelli-wha-db",
  }));

  app.register(
    async (admin) => {
      admin.addHook("onRequest", async (request, reply) => {
        const authorization = request.headers.authorization;
        if (!token)
          return reply.code(503).send({ error: "Admin API disabled" });
        const expected = Buffer.from(`Bearer ${token}`);
        const supplied = Buffer.from(authorization ?? "");
        if (
          expected.length !== supplied.length ||
          !timingSafeEqual(expected, supplied)
        ) {
          return reply
            .code(401)
            .header("WWW-Authenticate", "Bearer")
            .send({ error: "Unauthorized" });
        }
      });

      admin.get("/tenants", async (request) => ({
        tenants: await listTenants(limitFromQuery(request.query)),
      }));

      admin.get("/contacts", async (request) => ({
        contacts: await listContacts(limitFromQuery(request.query)),
      }));

      admin.get("/conversations", async (request) => ({
        conversations: await listConversations(limitFromQuery(request.query)),
      }));

      admin.get<{ Params: { id: string } }>(
        "/conversations/:id",
        async (request, reply) => {
          const conversation = await getConversation(request.params.id);
          if (!conversation)
            return reply.code(404).send({ error: "Conversation not found" });

          return { conversation };
        },
      );

      admin.get("/generation-jobs", async (request) => ({
        jobs: await listGenerationJobs(limitFromQuery(request.query)),
      }));

      admin.get("/assets", async (request) => ({
        assets: await listAssets(limitFromQuery(request.query)),
      }));
    },
    { prefix: "/admin" },
  );
  return app;
}

function limitFromQuery(query: unknown) {
  const raw =
    typeof query === "object" && query && "limit" in query
      ? Number(query.limit)
      : 50;
  if (!Number.isFinite(raw)) return 50;
  return Math.min(Math.max(Math.trunc(raw), 1), 200);
}
