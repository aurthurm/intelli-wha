export function questionForMissingFields(missing: string[]) {
  const prompts: Record<string, string> = {
    price: "price",
    style: "style: clean, bold promo, premium, boutique, streetwear, or simple",
    platform: "where to post: WhatsApp Status, WhatsApp group, Instagram/Facebook, or catalog"
  };

  return `Before I generate, send ${missing.map((field) => prompts[field] ?? field).join("; ")}.`;
}
