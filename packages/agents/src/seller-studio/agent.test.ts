import { describe, expect, it } from "vitest";
import type {
  AgentAction,
  IncomingMessage,
  SellerMemory,
} from "@intelli-wha/core";
import { sellerStudioAgent } from "./agent.js";

describe("sellerStudioAgent", () => {
  it("generates a corrected preview, not a final, and preserves tenant identity", async () => {
    const result = await sellerStudioAgent.handle({
      message: message({
        tenantId: "tenant-a",
        text: "ok but change price to $30 and use clean style",
      }),
      state: {
        productImageReceived: true,
        brief: { price: "$25", style: "premium", platform: "whatsapp-status" },
        lastJob: "seller.generatePreview",
      },
      runtime: {},
    });
    expect(result.actions).toContainEqual(
      expect.objectContaining({
        type: "enqueueJob",
        job: expect.objectContaining({
          name: "seller.generatePreview",
          payload: expect.objectContaining({
            tenantId: "tenant-a",
            userId: "seller-1",
            brief: expect.objectContaining({ price: "$30", style: "clean" }),
          }),
        }),
      }),
    );
    expect(
      result.actions.some(
        (action) =>
          action.type === "enqueueJob" &&
          action.job.name === "seller.generateFinalPack",
      ),
    ).toBe(false);
  });
  it("asks for a product photo before spending generation tokens", async () => {
    const result = await sellerStudioAgent.handle({
      message: message({ text: "Make a classy poster for my shop" }),
      state: {},
      runtime: {},
    });

    expect(actionTypes(result.actions)).toEqual(["reply"]);
    expect(textReplies(result.actions).join(" ")).toMatch(/product photo/i);
    expect(result.actions.some((action) => action.type === "enqueueJob")).toBe(
      false,
    );
  });

  it("asks only for missing commercial details after receiving a product image", async () => {
    const result = await sellerStudioAgent.handle({
      message: message({ media: [{ kind: "image", mimeType: "image/jpeg" }] }),
      state: {},
      runtime: {},
    });

    expect(result.actions.some((action) => action.type === "enqueueJob")).toBe(
      false,
    );
    expect(textReplies(result.actions).join(" ")).toMatch(/price/i);
    expect(textReplies(result.actions).join(" ")).toMatch(/style/i);
    expect(textReplies(result.actions).join(" ")).toMatch(/where to post/i);
  });

  it("uses long-term style and platform memory so returning sellers answer fewer questions", async () => {
    const memory: SellerMemory = {
      businessName: "Athens Boutique",
      preferredStyles: ["premium"],
      preferredPlatforms: ["whatsapp-status"],
    };

    const result = await sellerStudioAgent.handle({
      message: message({
        text: "price is $25",
        media: [{ kind: "image", mimeType: "image/jpeg" }],
      }),
      state: {},
      runtime: {},
      memory: { shortTerm: {}, longTerm: memory },
    });

    expect(actionTypes(result.actions)).toContain("enqueueJob");
    expect(textReplies(result.actions).join(" ")).toMatch(/low-cost preview/i);
  });

  it("remembers brand preferences when the seller states them conversationally", async () => {
    const result = await sellerStudioAgent.handle({
      message: message({
        text: "Remember my business name is Athens Boutique and contact is 0772000000. I prefer premium style.",
      }),
      state: {},
      runtime: {},
    });

    const remember = result.actions.find(
      (action) => action.type === "remember",
    );
    expect(remember).toMatchObject({
      type: "remember",
      memory: {
        businessName: "Athens Boutique",
        contact: "0772000000",
        preferredStyles: ["premium"],
      },
    });
  });

  it("benchmarks token-saving behavior across common early conversations", async () => {
    const cases = [
      {
        name: "text only",
        input: message({ text: "Need a poster for shoes" }),
        state: {},
        shouldGenerate: false,
      },
      {
        name: "image but no brief",
        input: message({ media: [{ kind: "image" }] }),
        state: {},
        shouldGenerate: false,
      },
      {
        name: "image with price only",
        input: message({ text: "price is $12", media: [{ kind: "image" }] }),
        state: {},
        shouldGenerate: false,
      },
      {
        name: "complete request",
        input: message({
          text: "price is $12, clean style for WhatsApp status",
          media: [{ kind: "image" }],
        }),
        state: {},
        shouldGenerate: true,
      },
    ];

    const results = await Promise.all(
      cases.map(async (item) => ({
        name: item.name,
        shouldGenerate: item.shouldGenerate,
        result: await sellerStudioAgent.handle({
          message: item.input,
          state: item.state,
          runtime: {},
        }),
      })),
    );

    for (const item of results) {
      expect(
        item.result.actions.some((action) => action.type === "enqueueJob"),
        `${item.name} generation decision`,
      ).toBe(item.shouldGenerate);
    }

    const prematureGenerations = results.filter(
      (item) =>
        !item.shouldGenerate &&
        item.result.actions.some((action) => action.type === "enqueueJob"),
    );
    expect(prematureGenerations).toHaveLength(0);
  });

  it("creates the final pack only after preview approval", async () => {
    const result = await sellerStudioAgent.handle({
      message: message({ text: "YES" }),
      state: {
        productImageReceived: true,
        brief: {
          price: "$25",
          style: "premium",
          platform: "whatsapp-status",
        },
        lastJob: "seller.generatePreview",
      },
      runtime: {},
    });

    expect(textReplies(result.actions).join(" ")).toMatch(/final pack/i);
    expect(result.actions).toContainEqual(
      expect.objectContaining({
        type: "enqueueJob",
        job: expect.objectContaining({ name: "seller.generateFinalPack" }),
      }),
    );
  });
});

function message(overrides: Partial<IncomingMessage>): IncomingMessage {
  return {
    id: crypto.randomUUID(),
    channel: "whatsapp",
    userId: "seller-1",
    chatId: "chat-1",
    receivedAt: new Date(),
    ...overrides,
  };
}

function actionTypes(actions: AgentAction[]) {
  return actions.map((action) => action.type);
}

function textReplies(actions: AgentAction[]) {
  return actions.flatMap((action) =>
    action.type === "reply" && action.message.text ? [action.message.text] : [],
  );
}
