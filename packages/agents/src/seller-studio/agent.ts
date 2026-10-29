import type { AgentPlugin } from "@intelli-wha/core";
import { executeSellerDecision } from "./executor.js";
import { perceiveSellerInput } from "./perception.js";
import { planSellerDecision } from "./planner.js";
import { checkSellerReadiness } from "./readiness.js";
import { rewriteSellerTask } from "./rewrite.js";
import { normalizeSellerStudioState, sellerStudioSchema } from "./schema.js";

export const sellerStudioAgent: AgentPlugin = {
  id: "seller-studio",
  canHandle(input) {
    const text = input.message.text?.toLowerCase() ?? "";
    return Boolean(
      input.message.media?.some((media) => media.kind === "image") ||
        /(poster|flyer|promo|advert|status|catalog|product|price|design)/i.test(text)
    );
  },
  defineSchema() {
    return sellerStudioSchema;
  },
  handle(input) {
    const state = normalizeSellerStudioState(input.state);
    const perception = perceiveSellerInput({
      text: input.message.text,
      mediaKinds: input.message.media?.map((media) => media.kind)
    });
    const brief = rewriteSellerTask({
      currentBrief: state.brief ?? {},
      text: input.message.text,
      memory: input.memory?.longTerm
    });
    const productImageReceived = state.productImageReceived || perception.productImageReceived;
    const readiness = checkSellerReadiness({
      action: "seller.generatePreview",
      brief,
      productImageReceived
    });
    const decision = planSellerDecision({
      productImageReceived,
      approval: perception.approval,
      lastJob: state.lastJob,
      readiness
    });

    return Promise.resolve(
      executeSellerDecision({
        decision,
        message: input.message,
        brief,
        productImageReceived,
        memoryPatch: perception.memoryPatch
      })
    );
  }
};
