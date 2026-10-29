import type { AgentSchema, JobRequest } from "@intelli-wha/core";

export interface SellerStudioBrief {
  price?: string;
  style?: string;
  platform?: string;
  audience?: string;
  businessName?: string;
  contact?: string;
}

export interface SellerStudioState {
  productImageReceived?: boolean;
  lastJob?: JobRequest["name"];
  brief?: SellerStudioBrief;
}

export const sellerStudioRequiredFields: Array<keyof SellerStudioBrief> = ["price", "style", "platform"];

export const sellerStudioSchema: AgentSchema = {
  topics: ["seller.generate-preview", "seller.generate-final-pack"],
  slotNames: ["productImage", "price", "style", "platform", "audience", "businessName", "contact"],
  actions: ["seller.generatePreview", "seller.generateFinalPack"],
  capabilities: [
    { kind: "generation", action: "seller.generatePreview" },
    { kind: "generation", action: "seller.generateFinalPack" }
  ]
};

export function normalizeSellerStudioState(state: Record<string, unknown>): SellerStudioState {
  return state as SellerStudioState;
}
