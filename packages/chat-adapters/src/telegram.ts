import { Bot, InputFile } from "grammy";
import type { IncomingMessage, OutgoingMessage } from "@intelli-wha/core";
import type { MessageTransport } from "@intelli-wha/chat-runtime";

export function createTelegramBot(token: string, onMessage: (message: IncomingMessage) => Promise<void>) {
  const bot = new Bot(token);

  bot.on("message", async (ctx) => {
    const text = ctx.message.text ?? ctx.message.caption;
    await onMessage({
      id: String(ctx.message.message_id),
      channel: "telegram",
      userId: String(ctx.from?.id ?? ctx.chat.id),
      chatId: String(ctx.chat.id),
      text,
      media: [],
      receivedAt: new Date(),
      raw: ctx.message
    });
  });

  return bot;
}

export class TelegramTransport implements MessageTransport {
  constructor(private readonly bot: Bot) {}

  async send(message: OutgoingMessage) {
    if (message.text) await this.bot.api.sendMessage(message.chatId, message.text);
    for (const media of message.media ?? []) {
      if (media.bufferBase64)
        await this.bot.api.sendPhoto(message.chatId, new InputFile(Buffer.from(media.bufferBase64, "base64"), media.fileName), {
          caption: media.caption
        });
      if (media.buffer)
        await this.bot.api.sendPhoto(message.chatId, new InputFile(Buffer.from(media.buffer), media.fileName), {
          caption: media.caption
        });
      if (media.url) await this.bot.api.sendPhoto(message.chatId, media.url, { caption: media.caption });
    }
  }
}
