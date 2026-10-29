import { sellerStudioAgent } from "@intelli-wha/agents";
import {
  createWhatsAppSocket,
  WhatsAppTransport,
} from "@intelli-wha/chat-adapters";
import {
  ConversationRuntime,
  createDeliveryWorker,
} from "@intelli-wha/chat-runtime";
import { env } from "@intelli-wha/config";
import { PostgresMessageStore } from "@intelli-wha/db";
import { logger } from "@intelli-wha/logger";

const store = new PostgresMessageStore();

const socket = await createWhatsAppSocket(
  env.WHATSAPP_AUTH_DIR,
  async (message) => {
    await runtime.handle(message);
  },
  logger,
);

const transport = new WhatsAppTransport(socket);
const runtime = new ConversationRuntime(sellerStudioAgent, store, transport);
const deliveryWorker = createDeliveryWorker("whatsapp", transport);

deliveryWorker.on("failed", (job, error) =>
  logger.error({ jobId: job?.id, error }, "WhatsApp delivery job failed"),
);

logger.info("WhatsApp bot started. Scan the QR code if this is the first run.");
