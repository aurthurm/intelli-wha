import { describe, expect, it, vi } from "vitest";
import type { ChatChannel } from "@intelli-wha/core";
const captured = vi.hoisted(() => ({
  workers: [] as {
    name: string;
    process: (job: unknown) => Promise<unknown>;
  }[],
}));
vi.mock("bullmq", () => ({
  Queue: class {},
  Worker: class {
    constructor(name: string, process: (job: unknown) => Promise<unknown>) {
      captured.workers.push({ name, process });
    }
  },
}));
vi.mock("@intelli-wha/queues", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, connection: {}, enqueueJob: vi.fn() };
});
vi.mock("ioredis", () => ({ Redis: class {} }));
import { createDeliveryWorker } from "./index.js";
describe("channel-bound workers", () => {
  it.each(["telegram", "whatsapp"] as ChatChannel[])(
    "only sends %s messages",
    async (channel) => {
      const send = vi.fn(async () => {});
      createDeliveryWorker(channel, { send });
      const worker = captured.workers.at(-1)!;
      expect(worker.name).toBe("delivery-" + channel);
      await expect(
        worker.process({
          name: "chat.deliverMessage",
          data: {
            message: {
              channel: channel === "telegram" ? "whatsapp" : "telegram",
              chatId: "same",
            },
          },
        }),
      ).rejects.toThrow("mismatch");
      await expect(
        worker.process({ name: "unknown", data: {} }),
      ).rejects.toThrow();
      expect(send).not.toHaveBeenCalled();
      await worker.process({
        name: "chat.deliverMessage",
        data: { message: { channel, chatId: "same" } },
      });
      expect(send).toHaveBeenCalledOnce();
    },
  );
});
