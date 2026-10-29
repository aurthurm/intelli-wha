import type { SellerMemory } from "@intelli-wha/core";
import type { SellerStudioBrief } from "./schema.js";

export interface RewriteSellerTaskInput {
  currentBrief: SellerStudioBrief;
  text?: string;
  memory?: SellerMemory;
}

export function rewriteSellerTask(
  input: RewriteSellerTaskInput,
): SellerStudioBrief {
  return applyMemoryDefaults(
    mergeBriefFromText(input.currentBrief, input.text),
    input.memory,
  );
}

function mergeBriefFromText(
  brief: SellerStudioBrief,
  text?: string,
): SellerStudioBrief {
  if (!text) return brief;

  const next = { ...brief };
  const lower = text.toLowerCase();
  // Only explicit currency/price or a numeric-only reply is a price, never a phone number in prose.
  const priceMatch =
    text.match(
      /(?:\bprice\s*(?:is|to|:|=)?\s*)((?:USD|ZWL|\$)\s*)?(\d+(?:[.,]\d{1,2})?)(?!\d|[.,]\d)/i,
    ) ??
    text.match(/(\$|\bUSD\s*|\bZWL\s*)(\d+(?:[.,]\d{1,2})?)(?!\d|[.,]\d)/i) ??
    text.match(/^\s*()(\d+(?:[.,]\d{1,2})?)\s*$/);
  if (priceMatch) next.price = `${priceMatch[1]?.trim() ?? ""}${priceMatch[2]}`;
  if (/\bstatus\b/.test(lower)) next.platform = "whatsapp-status";
  if (/\bgroup\b/.test(lower)) next.platform = "whatsapp-group";
  if (/\b(instagram|facebook)\b/.test(lower)) next.platform = "social";
  const styleMatch = lower
    .match(/\b(premium|luxury|bold|clean|simple|boutique|streetwear)\b/g)
    ?.at(-1);
  if (styleMatch)
    next.style =
      styleMatch === "bold"
        ? "bold promo"
        : styleMatch === "luxury"
          ? "premium"
          : styleMatch;

  return next;
}

function applyMemoryDefaults(
  brief: SellerStudioBrief,
  memory?: SellerMemory,
): SellerStudioBrief {
  return {
    ...brief,
    businessName: brief.businessName ?? memory?.businessName,
    contact: brief.contact ?? memory?.contact,
    style: brief.style ?? memory?.preferredStyles?.[0],
    platform: brief.platform ?? memory?.preferredPlatforms?.[0],
    audience: brief.audience ?? memory?.audienceNotes?.[0],
  };
}
