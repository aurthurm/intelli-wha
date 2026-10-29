import type { MediaKind, SellerMemory } from "@intelli-wha/core";

export interface SellerPerceptionInput {
  text?: string;
  mediaKinds?: MediaKind[];
}

export interface SellerPerceptionResult {
  productImageReceived: boolean;
  approval?: "approved";
  memoryPatch?: Partial<SellerMemory>;
}

export function perceiveSellerInput(
  input: SellerPerceptionInput,
): SellerPerceptionResult {
  return {
    productImageReceived: input.mediaKinds?.includes("image") ?? false,
    approval: parseApproval(input.text),
    memoryPatch: extractMemoryFromText(input.text),
  };
}

function extractMemoryFromText(
  text?: string,
): Partial<SellerMemory> | undefined {
  if (!text) return undefined;

  const memory: Partial<SellerMemory> = {};
  const brandMatch = text.match(
    /(?:brand|shop|business)\s*(?:name)?\s*(?:is|:)\s*([A-Za-z0-9 '&.-]{2,60}?)(?=\s+(?:and|contact|phone|number|whatsapp|style|prefer)\b|[.!?]|$)/i,
  );
  const contactMatch = text.match(
    /(?:contact|phone|number|whatsapp)\s*(?:is|:)\s*([+0-9 ()-]{7,24})/i,
  );
  const styleMatch = text.match(
    /(?:remember|use|prefer|style)\s*(?:my)?\s*(?:style)?\s*(?:is|:)?\s*(premium|luxury|clean|simple|bold|boutique|streetwear)/i,
  );
  const platformMatch = text.match(
    /(?:usually|prefer|default).*(status|group|instagram|facebook|catalog)/i,
  );

  if (brandMatch?.[1]) memory.businessName = brandMatch[1].trim();
  if (contactMatch?.[1]) memory.contact = contactMatch[1].trim();
  if (styleMatch?.[1]) memory.preferredStyles = [normalizeStyle(styleMatch[1])];
  if (platformMatch?.[1])
    memory.preferredPlatforms = [normalizePlatform(platformMatch[1])];

  return Object.keys(memory).length > 0 ? memory : undefined;
}

function parseApproval(text?: string): "approved" | undefined {
  if (!text) return undefined;
  const normalized = text.trim();
  return /^(yes|y|approved|approve|go ahead|final|create final|ok)[.!\s]*$/i.test(
    normalized,
  )
    ? "approved"
    : undefined;
}

function normalizeStyle(style: string) {
  if (style.toLowerCase() === "luxury") return "premium";
  return style.toLowerCase();
}

function normalizePlatform(platform: string) {
  const lower = platform.toLowerCase();
  if (lower.includes("status")) return "whatsapp-status";
  if (lower.includes("group")) return "whatsapp-group";
  return lower;
}
