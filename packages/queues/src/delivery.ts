import type { ChatChannel, OutgoingMessage } from "@intelli-wha/core";

export function deliveryQueueName(channel: ChatChannel): string {
  if (channel !== "telegram" && channel !== "whatsapp")
    throw new Error("Unsupported delivery channel");
  return `delivery-${channel}`;
}

export function deliveryMessage(payload: unknown): OutgoingMessage {
  if (!payload || typeof payload !== "object" || !("message" in payload))
    throw new Error("Invalid delivery payload");
  const message = payload.message as OutgoingMessage | undefined;
  if (
    !message ||
    typeof message !== "object" ||
    typeof message.chatId !== "string" ||
    !message.chatId.trim()
  ) {
    throw new Error("Invalid delivery message");
  }
  deliveryQueueName(message.channel);
  return message;
}
