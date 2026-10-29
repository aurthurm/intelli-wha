import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.string().default("info"),
  DATABASE_URL: z.string().default("postgres://beak:beak@localhost:5432/intelli_wha"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  OPENAI_API_KEY: z.string().optional(),
  QWEN_API_KEY: z.string().optional(),
  FLUX_API_KEY: z.string().optional(),
  SEEDANCE_API_KEY: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  WHATSAPP_AUTH_DIR: z.string().default("auth_info_baileys"),
  LOCAL_STORAGE_DIR: z.string().default("storage")
});

export const env = envSchema.parse(process.env);
export type Env = typeof env;
