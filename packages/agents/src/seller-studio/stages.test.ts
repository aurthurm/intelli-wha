import { describe, expect, it } from "vitest";
import type { SellerMemory } from "@intelli-wha/core";
import { perceiveSellerInput } from "./perception.js";
import { rewriteSellerTask } from "./rewrite.js";
import { checkSellerReadiness } from "./readiness.js";
import { planSellerDecision } from "./planner.js";

describe("seller-studio staged flow", () => {
  it.each([
    "ok but change price to $30",
    "YES change to clean",
    "approved, not yet",
    "ok but change price",
  ])("does not approve mixed intent: %s", (text) => {
    expect(perceiveSellerInput({ text }).approval).toBeUndefined();
  });
  it.each(["YES", "ok!", "Approved.", "go ahead", "create final"])(
    "accepts standalone approval: %s",
    (text) => {
      expect(perceiveSellerInput({ text }).approval).toBe("approved");
    },
  );
  it("applies corrections over existing values and memory", () => {
    expect(
      rewriteSellerTask({
        currentBrief: {
          price: "$12",
          style: "premium",
          platform: "whatsapp-status",
        },
        text: "ok but change price to $30 and use clean style for instagram",
        memory: { preferredStyles: ["bold"] },
      }),
    ).toMatchObject({ price: "$30", style: "clean", platform: "social" });
    expect(
      rewriteSellerTask({
        currentBrief: { price: "$12" },
        text: "contact is 0772000000",
      }).price,
    ).toBe("$12");
  });
  it("perceives approval, image presence, and memory hints from a turn", () => {
    const perception = perceiveSellerInput({
      text: "Approved. My business name is Athens Boutique and I prefer premium style.",
      mediaKinds: ["image"],
    });

    expect(perception).toMatchObject({
      productImageReceived: true,
      approval: undefined,
      memoryPatch: {
        businessName: "Athens Boutique",
        preferredStyles: ["premium"],
      },
    });
  });

  it("rewrites message text plus memory defaults into a normalized brief", () => {
    const remembered: SellerMemory = {
      businessName: "Athens Boutique",
      preferredStyles: ["premium"],
      preferredPlatforms: ["whatsapp-status"],
    };

    const rewritten = rewriteSellerTask({
      currentBrief: {},
      text: "price is $12",
      memory: remembered,
    });

    expect(rewritten).toEqual({
      price: "$12",
      style: "premium",
      platform: "whatsapp-status",
      businessName: "Athens Boutique",
    });
  });

  it("computes readiness with the smallest next question", () => {
    const readiness = checkSellerReadiness({
      action: "seller.generatePreview",
      brief: { price: "$12", style: "premium" },
      productImageReceived: true,
    });

    expect(readiness).toMatchObject({
      ready: false,
      missingSlots: ["platform"],
      nextQuestion: expect.stringMatching(/where to post/i),
    });
  });

  it("plans a preview when image and required brief fields are ready", () => {
    const decision = planSellerDecision({
      productImageReceived: true,
      approval: undefined,
      lastJob: undefined,
      readiness: {
        action: "seller.generatePreview",
        ready: true,
        requiredSlots: ["price", "style", "platform"],
        missingSlots: [],
        ambiguousSlots: [],
      },
    });

    expect(decision).toEqual({ type: "generate-preview" });
  });
});
