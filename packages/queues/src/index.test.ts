import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  queues: new Map<string, { add: ReturnType<typeof vi.fn> }>(),
  persist: vi.fn(async () => undefined),
}));
vi.mock("ioredis", () => ({ Redis: class {} }));
vi.mock("@intelli-wha/config", () => ({ env: { REDIS_URL: "unused" } }));
vi.mock("@intelli-wha/db", () => ({
  createQueuedGenerationJob: mocks.persist,
}));
vi.mock("bullmq", () => ({
  Queue: class {
    add = vi.fn(async () => ({}));
    constructor(name: string) {
      mocks.queues.set(name, this);
    }
  },
}));
import { enqueueJob } from "./index.js";
describe("delivery routing", () => {
  it.each(["telegram", "whatsapp"])(
    "routes %s exclusively",
    async (channel) => {
      for (const queue of mocks.queues.values()) queue.add.mockClear();
      await enqueueJob({
        name: "chat.deliverMessage",
        payload: { message: { channel, chatId: "same-chat", text: "hello" } },
      });
      expect(
        mocks.queues.get("delivery-" + channel)?.add,
      ).toHaveBeenCalledOnce();
      expect(
        mocks.queues.get(
          "delivery-" + (channel === "telegram" ? "whatsapp" : "telegram"),
        )?.add,
      ).not.toHaveBeenCalled();
      expect(mocks.queues.has("delivery")).toBe(false);
    },
  );
  it.each([
    {},
    { message: { channel: "email", chatId: "x" } },
    { message: { channel: "telegram", chatId: "" } },
  ])("rejects malformed delivery %j", async (payload) => {
    await expect(
      enqueueJob({ name: "chat.deliverMessage", payload }),
    ).rejects.toThrow();
  });
});
