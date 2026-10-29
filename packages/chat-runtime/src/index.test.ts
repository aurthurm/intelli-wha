import { describe, expect, it, vi } from "vitest";
import type {
  AgentPlugin,
  ConversationRuntimeState,
  IncomingMessage,
  OutgoingMessage,
} from "@intelli-wha/core";
import {
  ConversationRuntime,
  InMemoryLongTermStore,
  type MessageTransport,
} from "./index.js";
import { AgentRegistry } from "./registry.js";

vi.mock("@intelli-wha/queues", () => ({ enqueueJob: vi.fn(), connection: {} }));

describe("ConversationRuntime memory", () => {
  it("isolates tenant state and memory", async () => {
    const store = new InMemoryLongTermStore();
    const first = { ...message("shared"), tenantId: "a" };
    await store.patchState(first, { secret: true });
    await store.remember(first, { businessName: "private" });
    for (const tenantId of ["b", undefined]) {
      await expect(store.getState({ ...first, tenantId })).resolves.toEqual({});
      await expect(
        store.getLongTermMemory({ ...first, tenantId }),
      ).resolves.toBeUndefined();
    }
  });
  it("persists long-term memory separately from short-term conversation state", async () => {
    const sent: OutgoingMessage[] = [];
    const store = new InMemoryLongTermStore();
    const runtime = new ConversationRuntime(
      {
        id: "memory-test",
        async handle(input) {
          if (!input.memory?.longTerm?.businessName) {
            return {
              actions: [
                {
                  type: "remember",
                  memory: {
                    businessName: "Athens Boutique",
                    preferredStyles: ["premium"],
                  },
                },
                { type: "statePatch", patch: { lastStep: "remembered" } },
              ],
            };
          }

          return {
            actions: [
              {
                type: "reply",
                message: {
                  channel: input.message.channel,
                  chatId: input.message.chatId,
                  text: `Using ${input.memory.longTerm.businessName} with ${input.memory.longTerm.preferredStyles?.[0]} style.`,
                },
              },
            ],
          };
        },
      },
      store,
      transport(sent),
    );

    const first = message("chat-a");
    await runtime.handle(first);
    await runtime.handle(message("chat-b"));

    expect(sent.at(-1)?.text).toBe("Using Athens Boutique with premium style.");
    await expect(store.getState(first)).resolves.toMatchObject({
      lastStep: "remembered",
    });
    await expect(store.getState(message("chat-b"))).resolves.toEqual({});
  });

  it("persists generic runtime task and readiness state separately from plugin state", async () => {
    const store = new InMemoryLongTermStore();
    const sent: OutgoingMessage[] = [];
    const runtime = new ConversationRuntime(
      {
        id: "runtime-state-test",
        async handle(input) {
          if (!input.runtime.activeTaskId) {
            return {
              actions: [
                { type: "statePatch", patch: { brief: { price: "$25" } } },
                {
                  type: "runtimePatch",
                  patch: {
                    activeAgentId: "runtime-state-test",
                    activeTaskId: "task-1",
                    activeTopic: {
                      id: "seller.generate-preview",
                      status: "active",
                      updatedAt: input.message.receivedAt.toISOString(),
                    },
                    readiness: {
                      action: "seller.generatePreview",
                      ready: false,
                      requiredSlots: ["price", "style", "platform"],
                      missingSlots: ["style", "platform"],
                      ambiguousSlots: [],
                      nextQuestion: "What style should I use?",
                    },
                  },
                },
              ],
            };
          }

          expect(input.runtime.activeTaskId).toBe("task-1");
          expect(input.runtime.activeTopic?.id).toBe("seller.generate-preview");
          expect(input.runtime.readiness?.missingSlots).toEqual([
            "style",
            "platform",
          ]);
          expect(input.state).toMatchObject({ brief: { price: "$25" } });

          return {
            actions: [
              {
                type: "reply",
                message: {
                  channel: input.message.channel,
                  chatId: input.message.chatId,
                  text: "Runtime state resumed",
                },
              },
            ],
          };
        },
      },
      store,
      transport(sent),
    );

    const incoming = message("chat-runtime-state");
    await runtime.handle(incoming);
    await runtime.handle({
      ...incoming,
      id: crypto.randomUUID(),
      text: "continue",
    });

    expect(sent.at(-1)?.text).toBe("Runtime state resumed");
    await expect(store.getState(incoming)).resolves.toMatchObject({
      brief: { price: "$25" },
      __runtime: {
        activeAgentId: "runtime-state-test",
        activeTaskId: "task-1",
        readiness: {
          action: "seller.generatePreview",
          ready: false,
          missingSlots: ["style", "platform"],
        },
      },
    });
  });

  it("resolves plugins from a registry and resumes the active plugin on later turns", async () => {
    const store = new InMemoryLongTermStore();
    const sent: OutgoingMessage[] = [];
    const sellerPlugin = plugin({
      id: "seller-studio",
      canHandle: (input) =>
        input.message.text?.toLowerCase().includes("poster") ?? false,
      reply: "seller plugin",
    });
    const supportPlugin = plugin({
      id: "support-desk",
      canHandle: (input) =>
        input.message.text?.toLowerCase().includes("refund") ?? false,
      reply: "support plugin",
    });
    const runtime = new ConversationRuntime(
      new AgentRegistry([sellerPlugin, supportPlugin]),
      store,
      transport(sent),
    );

    const first = message("chat-plugin");
    await runtime.handle({ ...first, text: "Need a poster for shoes" });
    await runtime.handle({
      ...first,
      id: crypto.randomUUID(),
      text: "make it premium",
    });

    expect(sent.map((item) => item.text)).toEqual([
      "seller plugin",
      "seller plugin",
    ]);
    await expect(store.getState(first)).resolves.toMatchObject({
      __runtime: {
        activeAgentId: "seller-studio",
      },
    });
  });
});

function message(chatId: string): IncomingMessage {
  return {
    id: crypto.randomUUID(),
    channel: "whatsapp",
    userId: "seller-1",
    chatId,
    text: "hello",
    receivedAt: new Date(),
  };
}

function transport(sent: OutgoingMessage[]): MessageTransport {
  return {
    async send(message) {
      sent.push(message);
    },
  };
}

function plugin(config: {
  id: string;
  canHandle: AgentPlugin["canHandle"];
  reply: string;
}): AgentPlugin {
  return {
    id: config.id,
    canHandle: config.canHandle,
    async handle(input) {
      return {
        actions: [
          {
            type: "runtimePatch",
            patch: {
              activeAgentId: config.id,
            } satisfies Partial<ConversationRuntimeState>,
          },
          {
            type: "reply",
            message: {
              channel: input.message.channel,
              chatId: input.message.chatId,
              text: config.reply,
            },
          },
        ],
      };
    },
  };
}
