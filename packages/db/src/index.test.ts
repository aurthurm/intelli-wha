import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { IncomingMessage } from "@intelli-wha/core";
const mock = vi.hoisted(() => ({
  rows: [] as unknown[][],
  predicates: [] as unknown[],
  inserts: [] as Record<string, unknown>[],
  updates: [] as Record<string, unknown>[],
}));
vi.mock("postgres", () => ({ default: vi.fn(() => ({})) }));
vi.mock("@intelli-wha/config", () => ({ env: { DATABASE_URL: "unused" } }));
vi.mock("drizzle-orm/postgres-js", () => ({
  drizzle: () => ({
    select: () => ({
      from: () => ({
        where: (predicate: unknown) => {
          mock.predicates.push(predicate);
          return { limit: async () => mock.rows.shift() ?? [] };
        },
      }),
    }),
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        mock.inserts.push(values);
        return { returning: async () => mock.rows.shift() ?? [] };
      },
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        mock.updates.push(values);
        return {
          where: async (predicate: unknown) => {
            mock.predicates.push(predicate);
          },
        };
      },
    }),
  }),
}));
import { PostgresMessageStore, createQueuedGenerationJob } from "./index.js";
const dialect = new PgDialect();
const message: IncomingMessage = {
  id: "m",
  channel: "telegram",
  tenantId: "tenant-b",
  userId: "sender-b",
  chatId: "shared-group",
  receivedAt: new Date(),
};
const contact = {
  id: "contact-b",
  tenantId: "tenant-b",
  profile: { sellerMemory: { businessName: "B" } },
};
const conversation = {
  id: "conversation-b",
  tenantId: "tenant-b",
  state: { private: "B" },
};
function query(index: number) {
  return dialect.sqlToQuery(mock.predicates[index] as SQL);
}
beforeEach(() => {
  mock.rows = [];
  mock.predicates = [];
  mock.inserts = [];
  mock.updates = [];
});
describe("database identity isolation", () => {
  it("scopes contact memory by tenant/channel/sender", async () => {
    mock.rows = [[contact]];
    expect(await new PostgresMessageStore().getLongTermMemory(message)).toEqual(
      { businessName: "B" },
    );
    expect(query(0).params).toEqual(["tenant-b", "telegram", "sender-b"]);
    expect(query(0).sql).toContain('"contacts"."tenant_id"');
  });
  it("scopes group conversation by tenant/channel/chat/contact", async () => {
    mock.rows = [[contact], [conversation]];
    expect(await new PostgresMessageStore().getState(message)).toEqual({
      private: "B",
    });
    expect(query(0).params).toEqual(["tenant-b", "telegram", "sender-b"]);
    expect(query(1).params).toEqual([
      "tenant-b",
      "contact-b",
      "telegram",
      "shared-group",
    ]);
    expect(query(1).sql).toContain('"conversations"."contact_id"');
  });
  it("never falls back to another sender when contact is absent", async () => {
    mock.rows = [[]];
    expect(await new PostgresMessageStore().getState(message)).toEqual({});
    expect(mock.predicates).toHaveLength(1);
  });
  it("uses default tenant only for absent tenant identity", async () => {
    mock.rows = [[{ id: "default-id" }], []];
    expect(
      await new PostgresMessageStore().getLongTermMemory({
        ...message,
        tenantId: undefined,
      }),
    ).toBeUndefined();
    expect(query(1).params).toEqual(["default-id", "telegram", "sender-b"]);
    await expect(
      new PostgresMessageStore().getState({ ...message, tenantId: "" }),
    ).rejects.toThrow("Invalid tenant");
  });
  it("creates records within the supplied tenant rather than default", async () => {
    mock.rows = [[], [], [contact], [conversation]];
    await new PostgresMessageStore().patchState(message, { changed: true });
    expect(mock.inserts[0]).toMatchObject({
      tenantId: "tenant-b",
      externalId: "sender-b",
    });
    expect(mock.inserts[1]).toMatchObject({
      tenantId: "tenant-b",
      contactId: "contact-b",
      chatId: "shared-group",
    });
  });
  it("associates generation jobs with exact tenant and sender conversation", async () => {
    mock.rows = [[contact], [conversation], [{ id: "job-b" }]];
    await createQueuedGenerationJob({
      name: "seller.generatePreview",
      payload: {
        tenantId: "tenant-b",
        channel: "telegram",
        chatId: "shared-group",
        userId: "sender-b",
      },
    });
    expect(query(0).params).toEqual(["tenant-b", "telegram", "sender-b"]);
    expect(query(1).params).toEqual([
      "tenant-b",
      "contact-b",
      "telegram",
      "shared-group",
    ]);
    expect(mock.inserts[0]).toMatchObject({
      tenantId: "tenant-b",
      conversationId: "conversation-b",
    });
  });
  it.each([
    { channel: "telegram", chatId: "shared-group" },
    {
      channel: "telegram",
      chatId: "shared-group",
      userId: "sender",
      tenantId: 42,
    },
  ])("rejects ambiguous generation identity %j", async (payload) => {
    await expect(
      createQueuedGenerationJob({ name: "seller.generatePreview", payload }),
    ).rejects.toThrow("Invalid generation identity");
    expect(mock.inserts).toHaveLength(0);
  });
});
