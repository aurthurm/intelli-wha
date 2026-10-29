import { Worker, type Job } from "bullmq";
import type {
  ChatChannel,
  AgentModule,
  ConversationMemory,
  ConversationRuntimeState,
  IncomingMessage,
  OutgoingMessage,
  SellerMemory,
} from "@intelli-wha/core";
import {
  connection,
  enqueueJob,
  deliveryQueueName,
  deliveryMessage,
} from "@intelli-wha/queues";
import { AgentRegistry } from "./registry.js";
import {
  buildStoredState,
  mergeRuntimeState,
  splitRuntimeState,
} from "./state.js";

export interface MessageStore {
  getState(message: IncomingMessage): Promise<Record<string, unknown>>;
  patchState(
    message: IncomingMessage,
    patch: Record<string, unknown>,
  ): Promise<void>;
  getLongTermMemory?(
    message: IncomingMessage,
  ): Promise<SellerMemory | undefined>;
  remember?(
    message: IncomingMessage,
    memory: Partial<SellerMemory>,
  ): Promise<void>;
}

export interface MessageTransport {
  send(message: OutgoingMessage): Promise<void>;
}

export class InMemoryMessageStore implements MessageStore {
  private readonly states = new Map<string, Record<string, unknown>>();

  async getState(message: IncomingMessage) {
    return this.states.get(keyFor(message)) ?? {};
  }

  async patchState(message: IncomingMessage, patch: Record<string, unknown>) {
    const key = keyFor(message);
    this.states.set(key, { ...(this.states.get(key) ?? {}), ...patch });
  }
}

export class InMemoryLongTermStore extends InMemoryMessageStore {
  private readonly memories = new Map<string, SellerMemory>();

  async getLongTermMemory(message: IncomingMessage) {
    return this.memories.get(memoryKeyFor(message));
  }

  async remember(message: IncomingMessage, memory: Partial<SellerMemory>) {
    const key = memoryKeyFor(message);
    this.memories.set(key, mergeSellerMemory(this.memories.get(key), memory));
  }
}

export class ConversationRuntime {
  constructor(
    private readonly agentOrRegistry: AgentModule | AgentRegistry,
    private readonly store: MessageStore,
    private readonly transport: MessageTransport,
  ) {}

  async handle(message: IncomingMessage) {
    const storedState = await this.store.getState(message);
    const { runtime, shortTerm } = splitRuntimeState(storedState);
    const memory: ConversationMemory = {
      shortTerm,
      longTerm: await this.store.getLongTermMemory?.(message),
      runtime,
    };
    const agent = await this.resolveAgent({
      message,
      state: shortTerm,
      runtime,
      memory,
    });
    const result = await agent.handle({
      message,
      state: shortTerm,
      runtime,
      memory,
    });

    let statePatch: Record<string, unknown> | undefined;
    let runtimePatch: Partial<ConversationRuntimeState> | undefined;

    for (const action of result.actions) {
      if (action.type === "reply") await this.transport.send(action.message);
      if (action.type === "remember")
        await this.store.remember?.(message, action.memory);
      if (action.type === "enqueueJob") await enqueueJob(action.job);
      if (action.type === "statePatch")
        statePatch = { ...(statePatch ?? {}), ...action.patch };
      if (action.type === "runtimePatch") {
        runtimePatch = runtimePatch
          ? mergeRuntimeState(runtimePatch, action.patch)
          : action.patch;
      }
    }

    if (this.agentOrRegistry instanceof AgentRegistry && !runtimePatch) {
      runtimePatch = { activeAgentId: agent.id };
    }

    if (statePatch || runtimePatch) {
      const nextState = buildStoredState(
        statePatch ?? shortTerm,
        runtimePatch,
        runtime,
      );
      await this.store.patchState(message, nextState);
    }
  }

  private async resolveAgent(input: {
    message: IncomingMessage;
    state: Record<string, unknown>;
    runtime: ConversationRuntimeState;
    memory: ConversationMemory;
  }) {
    if (this.agentOrRegistry instanceof AgentRegistry) {
      const agent = await this.agentOrRegistry.resolve(input);
      if (!agent)
        throw new Error(
          `No agent plugin could handle message ${input.message.id}`,
        );
      return agent;
    }

    return this.agentOrRegistry;
  }
}

export function createDeliveryWorker(
  channel: ChatChannel,
  transport: MessageTransport,
) {
  return new Worker(
    deliveryQueueName(channel),
    async (job: Job) => {
      if (job.name !== "chat.deliverMessage")
        throw new Error("Unexpected delivery job");
      const message = deliveryMessage(job.data);
      if (message.channel !== channel)
        throw new Error("Delivery channel mismatch");
      await transport.send(message);
      return { delivered: true };
    },
    { connection },
  );
}

function keyFor(message: IncomingMessage) {
  return JSON.stringify([
    message.tenantId ?? null,
    message.channel,
    message.chatId,
    message.userId,
  ]);
}

function memoryKeyFor(message: IncomingMessage) {
  return JSON.stringify([
    message.tenantId ?? null,
    message.channel,
    message.userId,
  ]);
}

function mergeSellerMemory(
  current: SellerMemory | undefined,
  patch: Partial<SellerMemory>,
): SellerMemory {
  return {
    ...current,
    ...patch,
    preferredStyles: mergeList(current?.preferredStyles, patch.preferredStyles),
    preferredPlatforms: mergeList(
      current?.preferredPlatforms,
      patch.preferredPlatforms,
    ),
    brandColors: mergeList(current?.brandColors, patch.brandColors),
    audienceNotes: mergeList(current?.audienceNotes, patch.audienceNotes),
  };
}

function mergeList(current: string[] | undefined, next: string[] | undefined) {
  return Array.from(new Set([...(current ?? []), ...(next ?? [])]));
}
