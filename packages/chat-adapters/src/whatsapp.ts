import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  type WASocket
} from "@whiskeysockets/baileys";
import type { IncomingMessage, OutgoingMessage } from "@intelli-wha/core";
import type { MessageTransport } from "@intelli-wha/chat-runtime";

export async function createWhatsAppSocket(
  authDir: string,
  onMessage: (message: IncomingMessage) => Promise<void>,
  log: Pick<Console, "info" | "error"> = console
): Promise<WASocket> {
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();
  const socket = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: true
  });

  socket.ev.on("creds.update", saveCreds);
  socket.ev.on("connection.update", ({ connection, lastDisconnect }) => {
    if (connection === "close") {
      const statusCode = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
      if (statusCode !== DisconnectReason.loggedOut) {
        log.info("WhatsApp disconnected. Restart the bot process to reconnect.");
      }
    }
  });

  socket.ev.on("messages.upsert", async ({ messages }) => {
    for (const waMessage of messages) {
      if (!waMessage.message || waMessage.key.fromMe) continue;
      const chatId = waMessage.key.remoteJid;
      if (!chatId) continue;

      const text =
        waMessage.message.conversation ??
        waMessage.message.extendedTextMessage?.text ??
        waMessage.message.imageMessage?.caption ??
        undefined;

      await onMessage({
        id: waMessage.key.id ?? crypto.randomUUID(),
        channel: "whatsapp",
        userId: waMessage.key.participant ?? chatId,
        chatId,
        text,
        media: waMessage.message.imageMessage
          ? [
              {
                kind: "image",
                mimeType: waMessage.message.imageMessage.mimetype ?? undefined,
                caption: waMessage.message.imageMessage.caption ?? undefined
              }
            ]
          : [],
        receivedAt: new Date(Number(waMessage.messageTimestamp ?? Date.now())),
        raw: waMessage
      });
    }
  });

  return socket;
}

export class WhatsAppTransport implements MessageTransport {
  constructor(private readonly socket: WASocket) {}

  async send(message: OutgoingMessage) {
    if (message.text) await this.socket.sendMessage(message.chatId, { text: message.text });

    for (const media of message.media ?? []) {
      if (media.kind === "image" && media.bufferBase64) {
        await this.socket.sendMessage(message.chatId, { image: Buffer.from(media.bufferBase64, "base64"), caption: media.caption });
      }
      if (media.kind === "image" && media.buffer) {
        await this.socket.sendMessage(message.chatId, { image: Buffer.from(media.buffer), caption: media.caption });
      }
      if (media.kind === "image" && media.url) {
        await this.socket.sendMessage(message.chatId, { image: { url: media.url }, caption: media.caption });
      }
    }
  }
}
