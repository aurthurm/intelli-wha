import sharp from "sharp";

export interface PosterLayoutInput {
  title: string;
  price?: string;
  contact?: string;
  format: "whatsapp-status" | "square";
}

export async function createTextPoster(input: PosterLayoutInput) {
  const size = input.format === "whatsapp-status" ? { width: 1080, height: 1920 } : { width: 1080, height: 1080 };
  const svg = `
    <svg width="${size.width}" height="${size.height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#111827"/>
      <rect x="64" y="64" width="${size.width - 128}" height="${size.height - 128}" rx="28" fill="#f9fafb"/>
      <text x="108" y="180" font-family="Arial" font-size="64" font-weight="700" fill="#111827">${escapeXml(input.title)}</text>
      ${input.price ? `<text x="108" y="290" font-family="Arial" font-size="84" font-weight="700" fill="#047857">${escapeXml(input.price)}</text>` : ""}
      ${input.contact ? `<text x="108" y="${size.height - 140}" font-family="Arial" font-size="38" fill="#374151">${escapeXml(input.contact)}</text>` : ""}
    </svg>
  `;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
