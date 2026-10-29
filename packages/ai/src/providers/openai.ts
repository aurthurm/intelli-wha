import OpenAI from "openai";
import { env } from "@intelli-wha/config";
import type { AiProvider, ChatRequest, ChatResponse, ImageEditRequest, ProductVision } from "../types.js";

export class OpenAiProvider implements AiProvider {
  id = "openai";
  private readonly client?: OpenAI;

  constructor() {
    this.client = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : undefined;
  }

  supports(task: string) {
    if (!this.client) return false;
    return ["chat", "vision", "image-edit"].includes(task);
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    if (!this.client) throw new Error("OPENAI_API_KEY is required for OpenAI chat.");

    const response = await this.client.responses.create({
      model: "gpt-5.2",
      input: [
        { role: "system", content: request.system },
        ...request.messages.map((message) => ({
          role: message.role,
          content: message.content
        }))
      ]
    });

    return { text: response.output_text };
  }

  async analyzeImage(): Promise<ProductVision> {
    if (!this.client) throw new Error("OPENAI_API_KEY is required for OpenAI vision.");
    return {
      summary: "Vision analysis adapter placeholder. Wire image input with Responses API once provider choice is finalized."
    };
  }

  async editImage(_request: ImageEditRequest): Promise<[]> {
    if (!this.client) throw new Error("OPENAI_API_KEY is required for OpenAI image generation.");
    throw new Error("OpenAI image edit adapter placeholder. Add model-specific payload once final image provider is selected.");
  }
}
