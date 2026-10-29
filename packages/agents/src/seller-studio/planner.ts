import type { ReadinessState, JobRequest } from "@intelli-wha/core";

export type SellerStudioDecision =
  | { type: "ask-for-image" }
  | { type: "ask-for-missing-details"; readiness: ReadinessState }
  | { type: "generate-preview" }
  | { type: "generate-final-pack" };

export interface PlanSellerDecisionInput {
  productImageReceived: boolean;
  approval?: "approved";
  lastJob?: JobRequest["name"];
  readiness: ReadinessState;
}

export function planSellerDecision(input: PlanSellerDecisionInput): SellerStudioDecision {
  if (!input.productImageReceived) return { type: "ask-for-image" };
  if (input.approval === "approved" && input.lastJob === "seller.generatePreview") {
    return { type: "generate-final-pack" };
  }
  if (!input.readiness.ready) return { type: "ask-for-missing-details", readiness: input.readiness };
  return { type: "generate-preview" };
}
