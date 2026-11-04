import { GoogleGenAI } from "@google/genai";

import { AppError, ErrorCodes } from "@bandcoin/errors";

/**
 * Google's image (Gemini 3.1 Flash Image), video (Veo 3.1 Fast) and writing
 * (Gemini 3.8 Flash) models, server side only: the key never reaches a
 * browser. A video is one 8 second clip with sound; it takes a few minutes, so
 * the call polls until it's done. (Imagen and Veo 3 are gone from the API, and
 * Google retires models often: these names are the one place to change.)
 */
export const GOOGLE_MODELS = {
  IMAGE: "gemini-3.1-flash-image",
  VIDEO: "veo-3.1-fast-generate-preview",
  TEXT: "gemini-3.8-flash",
} as const;

export const VIDEO_SECONDS = 8;
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const POLL_MS = 10_000;
const MAX_POLLS = 60;

export type Media = { bytes: Buffer; mimeType: string };
export type Written = { text: string; tokens: number | null };
export type GenerateProvider = {
  image(input: { prompt: string; aspectRatio: string }): Promise<Media>;
  video(input: { prompt: string; aspectRatio: string }): Promise<Media>;
  write(input: { prompt: string }): Promise<Written>;
};

const fail = (message: string) => new AppError(ErrorCodes.EXTERNAL_SERVICE_FAILED, { message });
const blocked = (what: string) =>
  new AppError(ErrorCodes.VALIDATION_FAILED, {
    message: `Google didn't make this ${what}: a safety filter stopped the prompt. Try describing it differently.`,
  });

export function googleProvider(
  apiKey = process.env.GEMINI_API_KEY,
  deps: { sleep?: (ms: number) => Promise<void>; fetch?: typeof fetch } = {},
): GenerateProvider {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)));
  const get = deps.fetch ?? fetch;
  const client = () => {
    if (!apiKey)
      throw new AppError(ErrorCodes.CONFIG_MISSING, { message: "Generating isn't set up yet." });
    return new GoogleGenAI({ apiKey });
  };

  return {
    async image({ prompt, aspectRatio }) {
      const response = await client().models.generateContent({
        model: GOOGLE_MODELS.IMAGE,
        contents: prompt,
        config: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio } },
      });
      const part = response.candidates?.[0]?.content?.parts?.find(
        (entry) => entry.inlineData?.data,
      );
      if (!part?.inlineData?.data) throw blocked("image");
      return {
        bytes: Buffer.from(part.inlineData.data, "base64"),
        mimeType: part.inlineData.mimeType ?? "image/png",
      };
    },

    async video({ prompt, aspectRatio }) {
      const ai = client();
      let operation = await ai.models.generateVideos({
        model: GOOGLE_MODELS.VIDEO,
        prompt,
        config: { aspectRatio, numberOfVideos: 1, durationSeconds: VIDEO_SECONDS },
      });
      for (let poll = 0; !operation.done && poll < MAX_POLLS; poll++) {
        await sleep(POLL_MS);
        operation = await ai.operations.getVideosOperation({ operation });
      }
      if (!operation.done) throw fail("The video took too long. Your coins came back.");
      if (operation.error) throw fail("Google couldn't make the video. Your coins came back.");
      const video = operation.response?.generatedVideos?.[0]?.video;
      if (!video?.uri && !video?.videoBytes) throw blocked("video");
      if (video.videoBytes)
        return { bytes: Buffer.from(video.videoBytes, "base64"), mimeType: "video/mp4" };
      const response = await get(video.uri!, { headers: { "x-goog-api-key": apiKey! } });
      if (!response.ok) throw fail("The video was made but couldn't be fetched. Try again.");
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > MAX_VIDEO_BYTES) throw fail("The video came out too large to keep.");
      return { bytes, mimeType: video.mimeType ?? "video/mp4" };
    },

    async write({ prompt }) {
      const result = await client().models.generateContent({
        model: GOOGLE_MODELS.TEXT,
        contents: prompt,
        config: { temperature: 0.7 },
      });
      const text = result.text?.trim();
      if (!text) throw blocked("text");
      return { text, tokens: result.usageMetadata?.totalTokenCount ?? null };
    },
  };
}
