import type {
  AgentAction,
  AgentResult,
  IncomingMessage,
  JobRequest,
  SellerMemory,
} from "@intelli-wha/core";
import type { SellerStudioBrief } from "./schema.js";
import type { SellerStudioDecision } from "./planner.js";

export interface ExecuteSellerDecisionInput {
  decision: SellerStudioDecision;
  message: IncomingMessage;
  brief: SellerStudioBrief;
  productImageReceived: boolean;
  memoryPatch?: Partial<SellerMemory>;
}

export function executeSellerDecision(
  input: ExecuteSellerDecisionInput,
): AgentResult {
  if (input.decision.type === "ask-for-image") {
    return {
      actions: [
        ...rememberActions(input.memoryPatch),
        ...replyActions(
          input.message,
          "Send me a product photo first. I’ll use your saved brand/style preferences, then ask only for anything still missing before creating sales content.",
        ),
      ],
    };
  }

  if (input.decision.type === "ask-for-missing-details") {
    return {
      actions: [
        ...rememberActions(input.memoryPatch),
        {
          type: "statePatch",
          patch: {
            productImageReceived: input.productImageReceived,
            brief: input.brief,
          },
        },
        ...replyActions(
          input.message,
          input.decision.readiness.nextQuestion ??
            "Tell me what is still missing.",
        ),
      ],
    };
  }

  if (input.decision.type === "generate-final-pack") {
    const finalJob: JobRequest = {
      name: "seller.generateFinalPack",
      payload: {
        tenantId: input.message.tenantId,
        channel: input.message.channel,
        chatId: input.message.chatId,
        userId: input.message.userId,
        brief: input.brief,
      },
    };

    return {
      actions: [
        ...rememberActions(input.memoryPatch),
        {
          type: "statePatch",
          patch: {
            productImageReceived: input.productImageReceived,
            brief: input.brief,
            lastJob: finalJob.name,
          },
        },
        ...replyActions(
          input.message,
          "Approved. I’m creating the final pack now.",
        ),
        { type: "enqueueJob", job: finalJob },
      ],
    };
  }

  const previewJob: JobRequest = {
    name: "seller.generatePreview",
    payload: {
      tenantId: input.message.tenantId,
      channel: input.message.channel,
      chatId: input.message.chatId,
      userId: input.message.userId,
      brief: input.brief,
      media: input.message.media?.map((media) => ({
        kind: media.kind,
        mimeType: media.mimeType,
        caption: media.caption,
      })),
    },
  };

  return {
    actions: [
      ...rememberActions(input.memoryPatch),
      {
        type: "statePatch",
        patch: {
          productImageReceived: input.productImageReceived,
          brief: input.brief,
          lastJob: previewJob.name,
        },
      },
      ...replyActions(
        input.message,
        "Got it. I’m preparing a low-cost preview first. If you like the direction, I’ll create the final WhatsApp-ready pack.",
      ),
      { type: "enqueueJob", job: previewJob },
    ],
  };
}

function replyActions(message: IncomingMessage, text: string): AgentAction[] {
  return [
    {
      type: "reply",
      message: {
        channel: message.channel,
        chatId: message.chatId,
        text,
      },
    },
  ];
}

function rememberActions(
  memory: Partial<SellerMemory> | undefined,
): AgentAction[] {
  return memory ? [{ type: "remember", memory }] : [];
}
