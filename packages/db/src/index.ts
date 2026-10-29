import { drizzle } from "drizzle-orm/postgres-js";
import { and, desc, eq, sql } from "drizzle-orm";
import postgres from "postgres";
import { env } from "@intelli-wha/config";
import type {
  ChatChannel,
  IncomingMessage,
  JobRequest,
  SellerMemory,
} from "@intelli-wha/core";
import * as schema from "./schema.js";

const client = postgres(env.DATABASE_URL);

export const db = drizzle(client, { schema });
export * from "./schema.js";

const defaultTenantName = "default";

export class PostgresMessageStore {
  async getState(message: IncomingMessage): Promise<Record<string, unknown>> {
    const conversation = await this.findConversation(message);
    return conversation?.state ?? {};
  }

  async patchState(
    message: IncomingMessage,
    patch: Record<string, unknown>,
  ): Promise<void> {
    const conversation = await this.ensureConversation(message);

    await db
      .update(schema.conversations)
      .set({
        state: { ...conversation.state, ...patch },
        updatedAt: new Date(),
      })
      .where(eq(schema.conversations.id, conversation.id));
  }

  async getLongTermMemory(
    message: IncomingMessage,
  ): Promise<SellerMemory | undefined> {
    const contact = await this.findContact(message);
    return contact?.profile?.sellerMemory as SellerMemory | undefined;
  }

  async remember(
    message: IncomingMessage,
    memory: Partial<SellerMemory>,
  ): Promise<void> {
    const contact = await this.ensureContact(message);
    const current = contact.profile?.sellerMemory as SellerMemory | undefined;

    await db
      .update(schema.contacts)
      .set({
        profile: {
          ...contact.profile,
          sellerMemory: mergeSellerMemory(current, memory),
        },
      })
      .where(eq(schema.contacts.id, contact.id));
  }

  async ensureConversation(message: IncomingMessage) {
    const existing = await this.findConversation(message);
    if (existing) return existing;

    const tenantId = await resolveTenantId(message);
    const contact = await this.ensureContact(message);
    const [conversation] = await db
      .insert(schema.conversations)
      .values({
        tenantId,
        contactId: contact.id,
        channel: message.channel,
        chatId: message.chatId,
        state: {},
      })
      .returning();

    return conversation;
  }

  private async findConversation(message: IncomingMessage) {
    const contact = await this.findContact(message);
    if (!contact) return undefined;
    const [conversation] = await db
      .select()
      .from(schema.conversations)
      .where(
        and(
          eq(schema.conversations.tenantId, contact.tenantId!),
          eq(schema.conversations.contactId, contact.id),
          eq(schema.conversations.channel, message.channel),
          eq(schema.conversations.chatId, message.chatId),
        ),
      )
      .limit(1);

    return conversation;
  }

  private async ensureContact(message: IncomingMessage) {
    const existing = await this.findContact(message);
    if (existing) return existing;

    const tenantId = await resolveTenantId(message);
    const [contact] = await db
      .insert(schema.contacts)
      .values({
        tenantId,
        channel: message.channel,
        externalId: message.userId,
        displayName: null,
        profile: {},
      })
      .returning();

    return contact;
  }

  private async findContact(message: IncomingMessage) {
    const tenantId = await resolveTenantId(message);
    const [contact] = await db
      .select()
      .from(schema.contacts)
      .where(
        and(
          eq(schema.contacts.tenantId, tenantId),
          eq(schema.contacts.channel, message.channel),
          eq(schema.contacts.externalId, message.userId),
        ),
      )
      .limit(1);

    return contact;
  }
}

export async function checkDatabase() {
  const result = await db.execute(sql<{ ok: number }>`select 1 as ok`);
  return result.length > 0;
}

export async function listTenants(limit = 50) {
  return db
    .select()
    .from(schema.tenants)
    .orderBy(desc(schema.tenants.createdAt))
    .limit(limit);
}

export async function listContacts(limit = 50) {
  return db
    .select({
      id: schema.contacts.id,
      tenantId: schema.contacts.tenantId,
      channel: schema.contacts.channel,
      externalId: schema.contacts.externalId,
      displayName: schema.contacts.displayName,
      profile: schema.contacts.profile,
      createdAt: schema.contacts.createdAt,
    })
    .from(schema.contacts)
    .orderBy(desc(schema.contacts.createdAt))
    .limit(limit);
}

export async function listConversations(limit = 50) {
  return db
    .select({
      id: schema.conversations.id,
      tenantId: schema.conversations.tenantId,
      contactId: schema.conversations.contactId,
      channel: schema.conversations.channel,
      chatId: schema.conversations.chatId,
      activeAgentId: schema.conversations.activeAgentId,
      state: schema.conversations.state,
      updatedAt: schema.conversations.updatedAt,
      createdAt: schema.conversations.createdAt,
    })
    .from(schema.conversations)
    .orderBy(desc(schema.conversations.updatedAt))
    .limit(limit);
}

export async function getConversation(id: string) {
  const [conversation] = await db
    .select()
    .from(schema.conversations)
    .where(eq(schema.conversations.id, id))
    .limit(1);
  return conversation;
}

export async function listGenerationJobs(limit = 50) {
  return db
    .select()
    .from(schema.generationJobs)
    .orderBy(
      desc(schema.generationJobs.updatedAt),
      desc(schema.generationJobs.createdAt),
    )
    .limit(limit);
}

export async function listAssets(limit = 50) {
  return db
    .select()
    .from(schema.assets)
    .orderBy(desc(schema.assets.createdAt))
    .limit(limit);
}

export async function createQueuedGenerationJob(job: JobRequest) {
  if (job.name === "chat.deliverMessage") return undefined;

  const conversation = await findConversationForJob(job.payload);
  const [generationJob] = await db
    .insert(schema.generationJobs)
    .values({
      tenantId: conversation.tenantId,
      conversationId: conversation.id,
      jobName: job.name,
      payload: job.payload,
    })
    .returning({ id: schema.generationJobs.id });

  return generationJob?.id;
}

export async function updateGenerationJobStatus(
  id: string,
  status: (typeof schema.generationStatus.enumValues)[number],
  result?: Record<string, unknown>,
) {
  await db
    .update(schema.generationJobs)
    .set({
      status,
      result,
      updatedAt: new Date(),
    })
    .where(eq(schema.generationJobs.id, id));
}

export async function createAssetForGenerationJob(input: {
  generationJobId: string;
  kind: string;
  url: string;
  mimeType?: string;
  metadata?: Record<string, unknown>;
}) {
  const [generationJob] = await db
    .select()
    .from(schema.generationJobs)
    .where(eq(schema.generationJobs.id, input.generationJobId))
    .limit(1);

  const [asset] = await db
    .insert(schema.assets)
    .values({
      tenantId: generationJob?.tenantId ?? null,
      kind: input.kind,
      url: input.url,
      mimeType: input.mimeType,
      metadata: {
        ...(input.metadata ?? {}),
        generationJobId: input.generationJobId,
      },
    })
    .returning();

  return asset;
}

async function ensureDefaultTenant() {
  const [existing] = await db
    .select()
    .from(schema.tenants)
    .where(eq(schema.tenants.name, defaultTenantName))
    .limit(1);
  if (existing) return existing;

  const [tenant] = await db
    .insert(schema.tenants)
    .values({ name: defaultTenantName })
    .returning();
  return tenant;
}

async function resolveTenantId(identity: { tenantId?: string }) {
  if (identity.tenantId !== undefined) {
    if (!identity.tenantId.trim()) throw new Error("Invalid tenant identity");
    return identity.tenantId;
  }
  return (await ensureDefaultTenant()).id;
}

async function findConversationForJob(payload: unknown) {
  const identity = jobIdentity(payload);
  const store = new PostgresMessageStore();
  // Resolve/create the exact identity without rewriting existing conversation state.
  return store.ensureConversation({
    ...identity,
    id: "job",
    receivedAt: new Date(),
  });
}

function jobIdentity(payload: unknown): {
  channel: ChatChannel;
  chatId: string;
  userId: string;
  tenantId?: string;
} {
  if (!payload || typeof payload !== "object")
    throw new Error("Missing generation identity");
  const data = payload as Record<string, unknown>;
  if (
    (data.channel !== "whatsapp" && data.channel !== "telegram") ||
    typeof data.chatId !== "string" ||
    !data.chatId.trim() ||
    typeof data.userId !== "string" ||
    !data.userId.trim() ||
    (data.tenantId !== undefined &&
      (typeof data.tenantId !== "string" || !data.tenantId.trim()))
  ) {
    throw new Error("Invalid generation identity");
  }
  return {
    channel: data.channel,
    chatId: data.chatId,
    userId: data.userId,
    tenantId: data.tenantId as string | undefined,
  };
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
