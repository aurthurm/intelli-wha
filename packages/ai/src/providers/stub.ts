import type { AiProvider, ChatRequest, ChatResponse, ImageEditRequest, ProductVision } from "../types.js";

export class StubAiProvider implements AiProvider {
  id = "stub";

  supports() {
    return true;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const last = request.messages.at(-1)?.content ?? "";
    return {
      text: `I can help create sales content. Send a product photo, price, audience, and style. Last message: ${last}`
    };
  }

  async analyzeImage(): Promise<ProductVision> {
    return {
      productType: "product",
      colors: [],
      qualityNotes: ["Using stub vision provider. Configure a real provider for image understanding."],
      recommendedStyles: ["clean shop poster", "bold promo", "premium lifestyle"],
      summary: "Product image received."
    };
  }

  async editImage(request: ImageEditRequest) {
    return [
      {
        mimeType: "text/plain",
        buffer: new TextEncoder().encode(`Stub generated asset for: ${request.prompt}`),
        metadata: { provider: this.id, quality: request.quality }
      }
    ];
  }
}
