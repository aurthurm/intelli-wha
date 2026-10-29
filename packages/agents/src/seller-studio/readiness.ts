import type { ReadinessState } from "@intelli-wha/core";
import { questionForMissingFields } from "./questions.js";
import type { SellerStudioBrief } from "./schema.js";
import { sellerStudioRequiredFields } from "./schema.js";

export interface CheckSellerReadinessInput {
  action: "seller.generatePreview" | "seller.generateFinalPack";
  brief: SellerStudioBrief;
  productImageReceived: boolean;
}

export function checkSellerReadiness(input: CheckSellerReadinessInput): ReadinessState {
  if (!input.productImageReceived) {
    return {
      action: input.action,
      ready: false,
      requiredSlots: ["productImage", ...sellerStudioRequiredFields],
      missingSlots: ["productImage"],
      ambiguousSlots: [],
      nextQuestion: "Send me a product photo first. I’ll use your saved brand/style preferences, then ask only for anything still missing before creating sales content.",
      reason: "product image required"
    };
  }

  const missingSlots = sellerStudioRequiredFields.filter((field) => !input.brief[field]);
  return {
    action: input.action,
    ready: missingSlots.length === 0,
    requiredSlots: sellerStudioRequiredFields,
    missingSlots,
    ambiguousSlots: [],
    nextQuestion: missingSlots.length > 0 ? questionForMissingFields(missingSlots) : undefined,
    reason: missingSlots.length > 0 ? "required commercial details missing" : undefined
  };
}
