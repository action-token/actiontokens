import OpenAI from "openai";

import { AppError, ErrorCodes } from "@bandcoin/errors";

import type { GenerateProvider } from "./google";
import { OPENAI_SIZES } from "./models";

/**
 * OpenAI's image (GPT Image) and writing (GPT) models for Studio, server side
 * only. OpenAI has no video API since Sora shut down (2026-09-24), so the
 * catalog offers no OpenAI video; asking anyway is refused.
 */
const blocked = (what: string) =>
  new AppError(ErrorCodes.VALIDATION_FAILED, {
    message: `OpenAI didn't make this ${what}: a safety filter stopped the prompt. Try describing it differently.`,
  });

export function openaiProvider(apiKey = process.env.OPENAI_API_KEY): GenerateProvider {
  const client = () => {
    if (!apiKey)
      throw new AppError(ErrorCodes.CONFIG_MISSING, { message: "Generating isn't set up yet." });
    return new OpenAI({ apiKey });
  };

  return {
    async image({ model, prompt, aspectRatio, quality, count }) {
      const result = await client().images.generate({
        model,
        prompt,
        size: (OPENAI_SIZES[aspectRatio] ?? "1024x1024") as "1024x1024",
        quality: (quality ?? "medium") as "medium",
        n: count,
      });
      const images = (result.data ?? []).filter((entry) => entry.b64_json);
      if (images.length === 0) throw blocked("image");
      return images.map((entry) => ({
        bytes: Buffer.from(entry.b64_json!, "base64"),
        mimeType: "image/png",
      }));
    },

    video() {
      return Promise.reject(
        new AppError(ErrorCodes.VALIDATION_FAILED, {
          message: "OpenAI can't make video any more. Pick a Google model.",
        }),
      );
    },

    async write({ model, prompt }) {
      const result = await client().responses.create({ model, input: prompt });
      const text = result.output_text?.trim();
      if (!text) throw blocked("text");
      return { text, tokens: result.usage?.total_tokens ?? null };
    },
  };
}
