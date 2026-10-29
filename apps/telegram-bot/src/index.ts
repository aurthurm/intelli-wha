import { sellerStudioAgent } from "@intelli-wha/agents";
import {
  createTelegramBot,
  TelegramTransport,
} from "@intelli-wha/chat-adapters";
import {
  ConversationRuntime,
  createDeliveryWorker,
} from "@intelli-wha/chat-runtime";
import { env } from "@intelli-wha/config";
import { PostgresMessageStore } from "@intelli-wha/db";
import { logger } from "@intelli-wha/logger";

if (!env.TELEGRAM_BOT_TOKEN) {
  throw new Error("TELEGRAM_BOT_TOKEN is required to run the Telegram bot.");
}

const store = new PostgresMessageStore();
const bot = createTelegramBot(env.TELEGRAM_BOT_TOKEN, async (message) =>
  runtime.handle(message),
);
const transport = new TelegramTransport(bot);
const runtime = new ConversationRuntime(sellerStudioAgent, store, transport);
const deliveryWorker = createDeliveryWorker("telegram", transport);

deliveryWorker.on("failed", (job, error) =>
  logger.error({ jobId: job?.id, error }, "Telegram delivery job failed"),
);

bot.start();
logger.info("Telegram bot started.");
