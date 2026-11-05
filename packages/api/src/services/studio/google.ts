import { GoogleGenAI } from "@google/genai";

import { AppError, ErrorCodes } from "@bandcoin/errors";

/**
 * Google's image (Nano Banana), video (Gemini Omni Flash) and writing
 * (Gemini) models, server side only: the key never reaches a browser. Images
 * and video go through the Interactions API (`interactions.create` with a
 * `response_format`), as Google's docs show for these models; writing uses
 * `generateContent`. The models themselves live in services/studio/models.
 */
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

export type Media = { bytes: Buffer; mimeType: string };
export type Written = { text: string; tokens: number | null };
/** One provider's side of a run: Google or OpenAI, the same shape. */
export type GenerateProvider = {
  image(input: {
    model: string;
    prompt: string;
    aspectRatio: string;
    size?: string;
    quality?: string;
    count: number;
  }): Promise<Media[]>;
  video(input: {
    model: string;
    prompt: string;
    aspectRatio: string;
    resolution?: string;
  }): Promise<Media>;
  write(input: { model: string; prompt: string }): Promise<Written>;
};

const fail = (message: string) => new AppError(ErrorCodes.EXTERNAL_SERVICE_FAILED, { message });
const blocked = (what: string) =>
  new AppError(ErrorCodes.VALIDATION_FAILED, {
    message: `Google didn't make this ${what}: a safety filter stopped the prompt. Try describing it differently.`,
  });

export function googleProvider(apiKey = process.env.GEMINI_API_KEY): GenerateProvider {
  const client = () => {
    if (!apiKey)
      throw new AppError(ErrorCodes.CONFIG_MISSING, { message: "Generating isn't set up yet." });
    return new GoogleGenAI({ apiKey });
  };

  async function oneImage(
    ai: GoogleGenAI,
    input: { model: string; prompt: string; aspectRatio: string; size?: string },
  ): Promise<Media> {
    const interaction = await ai.interactions.create({
      model: input.model,
      input: input.prompt,
      response_format: {
        type: "image",
        aspect_ratio: input.aspectRatio,
        ...(input.size ? { image_size: input.size } : {}),
      },
    });
    const image = interaction.output_image;
    if (!image?.data) throw blocked("image");
    return { bytes: Buffer.from(image.data, "base64"), mimeType: image.mime_type ?? "image/png" };
  }

  return {
    async image(input) {
      const ai = client();
      // One request per image: Google's examples return one image each.
      return Promise.all(Array.from({ length: input.count }, () => oneImage(ai, input)));
    },

    async video({ model, prompt, aspectRatio, resolution }) {
      const interaction = await client().interactions.create({
        model,
        input: prompt,
        response_format: {
          type: "video",
          aspect_ratio: aspectRatio,
          ...(resolution ? { resolution } : {}),
        },
      });
      const video = interaction.output_video;
      if (!video?.data) throw blocked("video");
      const bytes = Buffer.from(video.data, "base64");
      if (bytes.length > MAX_VIDEO_BYTES) throw fail("The video came out too large to keep.");
      return { bytes, mimeType: video.mime_type ?? "video/mp4" };
    },

    async write({ model, prompt }) {
      const result = await client().models.generateContent({
        model,
        contents: prompt,
        config: { temperature: 0.7 },
      });
      const text = result.text?.trim();
      if (!text) throw blocked("text");
      return { text, tokens: result.usageMetadata?.totalTokenCount ?? null };
    },
  };
}
