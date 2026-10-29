import type { AiTask, GenerationQuality } from "@intelli-wha/core";

export interface ChatRequest {
  system: string;
  messages: { role: "user" | "assistant" | "system"; content: string }[];
}

export interface ChatResponse {
  text: string;
}

export interface VisionRequest {
  image: Uint8Array | string;
  prompt: string;
}

export interface ProductVision {
  productType?: string;
  colors?: string[];
  qualityNotes?: string[];
  recommendedStyles?: string[];
  summary: string;
}

export interface ImageEditRequest {
  prompt: string;
  inputImages?: (Uint8Array | string)[];
  quality: GenerationQuality;
  size?: "1024x1024" | "1024x1536" | "1536x1024";
}

export interface GeneratedAsset {
  mimeType: string;
  buffer?: Uint8Array;
  url?: string;
  metadata?: Record<string, unknown>;
}

export interface AiProvider {
  id: string;
  supports(task: AiTask): boolean;
  chat?(request: ChatRequest): Promise<ChatResponse>;
  analyzeImage?(request: VisionRequest): Promise<ProductVision>;
  editImage?(request: ImageEditRequest): Promise<GeneratedAsset[]>;
  removeBackground?(image: Uint8Array): Promise<GeneratedAsset>;
  generateVideo?(request: ImageEditRequest): Promise<GeneratedAsset[]>;
}
