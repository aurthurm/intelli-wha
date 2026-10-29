import { jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const chatChannel = pgEnum("chat_channel", ["whatsapp", "telegram"]);
export const generationStatus = pgEnum("generation_status", ["queued", "running", "completed", "failed"]);

export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [uniqueIndex("tenants_name_unique").on(table.name)]
);

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    channel: chatChannel("channel").notNull(),
    externalId: text("external_id").notNull(),
    displayName: text("display_name"),
    profile: jsonb("profile").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [uniqueIndex("contacts_tenant_channel_external_unique").on(table.tenantId, table.channel, table.externalId)]
);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    contactId: uuid("contact_id").references(() => contacts.id),
    channel: chatChannel("channel").notNull(),
    chatId: text("chat_id").notNull(),
    activeAgentId: text("active_agent_id").notNull().default("seller-studio"),
    state: jsonb("state").$type<Record<string, unknown>>().default({}).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [uniqueIndex("conversations_tenant_channel_chat_contact_unique").on(table.tenantId, table.channel, table.chatId, table.contactId)]
);

export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").references(() => tenants.id),
  contactId: uuid("contact_id").references(() => contacts.id),
  name: text("name"),
  brief: jsonb("brief").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const assets = pgTable("assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").references(() => tenants.id),
  productId: uuid("product_id").references(() => products.id),
  kind: text("kind").notNull(),
  url: text("url"),
  mimeType: text("mime_type"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const generationJobs = pgTable("generation_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").references(() => tenants.id),
  conversationId: uuid("conversation_id").references(() => conversations.id),
  status: generationStatus("status").notNull().default("queued"),
  jobName: text("job_name").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
  result: jsonb("result").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});
