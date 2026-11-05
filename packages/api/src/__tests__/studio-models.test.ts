import { describe, expect, it, vi } from "vitest";

import { generateInput } from "../services/studio/generate-input";
import {
  checkOptions,
  defaultModel,
  modelOf,
  MODELS,
  providerReady,
} from "../services/studio/models";
import { pricingOf, runPrice } from "../services/studio/pricing";

const pricing = pricingOf(null);

describe("Studio models", () => {
  it("offers OpenAI and Google for images and writing, and Google for video", () => {
    const providers = (tool: string) =>
      [
        ...new Set(MODELS.filter((model) => model.tool === tool).map((model) => model.provider)),
      ].sort();
    expect(providers("IMAGE")).toEqual(["google", "openai"]);
    expect(providers("TEXT")).toEqual(["google", "openai"]);
    expect(providers("VIDEO")).toEqual(["google"]);
  });

  it("has one default per tool, and every default option is one the model allows", () => {
    for (const tool of ["IMAGE", "VIDEO", "TEXT", "SEO", "SOCIAL"] as const) {
      const model = defaultModel(tool);
      expect(model).toBeDefined();
      const input = generateInput.parse(
        tool === "SEO" || tool === "SOCIAL"
          ? { tool, topic: "new single" }
          : { tool, prompt: "a red guitar" },
      );
      expect(input.model).toBe(model.id);
      expect(() => checkOptions(input)).not.toThrow();
    }
  });

  it("writing tools (text, SEO, social) all use the text models", () => {
    expect(modelOf("SEO", defaultModel("TEXT").id)).toBeDefined();
    expect(modelOf("SOCIAL", "gpt-6-luna")?.provider).toBe("openai");
    expect(modelOf("IMAGE", "gpt-6-luna")).toBeUndefined();
  });

  it("refuses a model from another tool, or an option the model doesn't have", () => {
    const image = (extra: object) =>
      generateInput.parse({ tool: "IMAGE", prompt: "a red guitar", ...extra });
    expect(() => checkOptions(image({ model: "gemini-omni-1.1-flash" }))).toThrow(
      "That model can't make images.",
    );
    // OpenAI images come square, wide or tall only
    expect(() =>
      checkOptions(image({ model: "gpt-image-2.6-flare", aspectRatio: "16:9" })),
    ).toThrow("GPT Image 2.6 Flare can't make 16:9.");
    expect(() => checkOptions(image({ model: "gpt-image-2.6-flare", size: "4K" }))).toThrow();
    expect(() =>
      checkOptions(image({ model: "gemini-nano-banana-2.1", quality: "high" })),
    ).toThrow();
    expect(() => checkOptions(image({ count: 9 }))).toThrow();
  });

  it("prices a run from the model, how many images and their size or quality", () => {
    const image = (extra: object) =>
      runPrice(generateInput.parse({ tool: "IMAGE", prompt: "a red guitar", ...extra }), pricing);
    const one = image({});
    expect(one).toBeGreaterThanOrEqual(1);
    // four images cost about four times one (each rounded up once, as a whole run)
    expect(image({ count: 4 })).toBeGreaterThan(3 * one);
    expect(image({ size: "4K" })).toBeGreaterThan(one);
    const gpt = (quality: string) => image({ model: "gpt-image-2.6-flare", quality });
    expect(gpt("low")).toBeLessThan(gpt("medium"));
    expect(gpt("medium")).toBeLessThan(gpt("high"));
  });

  it("follows the admin's API cost for that model and the fee", () => {
    const input = generateInput.parse({ tool: "TEXT", prompt: "a bio for a band" });
    const saved = pricingOf({ feePercent: 0, apiCostUsd: { [input.model]: 0.5 } });
    expect(runPrice(input, saved)).toBe(50);
    expect(runPrice(input, pricingOf({ feePercent: 30, apiCostUsd: { [input.model]: 0.5 } }))).toBe(
      65,
    );
  });
});

describe("Enhance prompt", () => {
  it("asks the default text model to rewrite the prompt for the tool, and returns only the prompt", async () => {
    const { enhancePrompt } = await import("../services/studio/enhance");
    const write = vi
      .fn()
      .mockResolvedValue({ text: '"A neon city at night, rain, 35mm"', tokens: 9 });
    await expect(enhancePrompt({ tool: "IMAGE", prompt: "neon city" }, write)).resolves.toEqual({
      prompt: "A neon city at night, rain, 35mm",
    });
    expect(write).toHaveBeenCalledWith({
      model: "gemini-3.8-flash",
      prompt: expect.stringContaining("an image generator"),
    });
    await expect(enhancePrompt({ tool: "IMAGE", prompt: "x" }, write)).rejects.toThrow(
      /between 3 and/,
    );
  });
});

describe("which providers are set up", () => {
  it("needs each provider's own key", () => {
    expect(providerReady("google", { GEMINI_API_KEY: "k" })).toBe(true);
    expect(providerReady("google", { OPENAI_API_KEY: "k" })).toBe(false);
    expect(providerReady("openai", { OPENAI_API_KEY: "k" })).toBe(true);
    expect(providerReady("openai", { GEMINI_API_KEY: "k" })).toBe(false);
  });

  it("treats an empty or blank key as not set up", () => {
    expect(providerReady("openai", { OPENAI_API_KEY: "" })).toBe(false);
    expect(providerReady("openai", { OPENAI_API_KEY: "  " })).toBe(false);
  });
});
