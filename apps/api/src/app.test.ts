import { describe, expect, it, vi } from "vitest";
vi.mock("@intelli-wha/db", () => ({
  checkDatabase: vi.fn(async () => true),
  getConversation: vi.fn(async () => ({ id: "test" })),
  listAssets: vi.fn(async () => []),
  listContacts: vi.fn(async () => []),
  listConversations: vi.fn(async () => []),
  listGenerationJobs: vi.fn(async () => []),
  listTenants: vi.fn(async () => []),
}));
import { buildApp } from "./app.js";
import { listContacts } from "@intelli-wha/db";
const routes = [
  "tenants",
  "contacts",
  "conversations",
  "conversations/test",
  "generation-jobs",
  "assets",
];
describe("admin authorization", () => {
  it.each([undefined, "", "   "])(
    "fails closed with token %s",
    async (adminToken) => {
      const app = buildApp({ adminToken });
      for (const route of routes)
        expect(
          (
            await app.inject({
              url: "/admin/" + route,
              headers: { authorization: "Bearer anything" },
            })
          ).statusCode,
        ).toBe(503);
      for (const url of ["/health", "/health/db"])
        expect((await app.inject({ url })).statusCode).toBe(200);
      await app.close();
    },
  );
  it("rejects missing/wrong auth before querying and allows exact bearer", async () => {
    vi.mocked(listContacts).mockClear();
    const app = buildApp({ adminToken: "test-admin-token" });
    for (const authorization of [
      undefined,
      "Bearer wrong",
      "Basic test-admin-token",
      "Bearer test-admin-token-extra",
    ]) {
      for (const route of routes)
        expect(
          (
            await app.inject({
              url: "/admin/" + route,
              headers: authorization ? { authorization } : {},
            })
          ).statusCode,
        ).toBe(401);
    }
    expect(listContacts).not.toHaveBeenCalled();
    for (const route of routes)
      expect(
        (
          await app.inject({
            url: "/admin/" + route,
            headers: { authorization: "Bearer test-admin-token" },
          })
        ).statusCode,
      ).toBe(200);
    expect((await app.inject({ url: "/health" })).statusCode).toBe(200);
    await app.close();
  });
});
