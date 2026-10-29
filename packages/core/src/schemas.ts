import { z } from "zod";

export const chatChannelSchema = z.enum(["whatsapp", "telegram"]);

export const incomingMessageSchema = z.object({
  id: z.string(),
  channel: chatChannelSchema,
  tenantId: z.string().optional(),
  userId: z.string(),
  chatId: z.string(),
  text: z.string().optional(),
  receivedAt: z.coerce.date()
});

export const sellerProfileSchema = z.object({
  businessName: z.string().optional(),
  contactText: z.string().optional(),
  location: z.string().optional(),
  brandColors: z.array(z.string()).default([]),
  defaultLanguage: z.string().default("en")
});

export const productBriefSchema = z.object({
  productType: z.string().optional(),
  price: z.string().optional(),
  targetAudience: z.string().optional(),
  style: z.string().optional(),
  platform: z.enum(["whatsapp-status", "whatsapp-group", "instagram", "facebook", "catalog"]).optional(),
  offer: z.string().optional()
});

export type SellerProfile = z.infer<typeof sellerProfileSchema>;
export type ProductBrief = z.infer<typeof productBriefSchema>;
