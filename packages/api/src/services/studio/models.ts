import { AppError, ErrorCodes } from "@bandcoin/errors";

import type { GenerateInput } from "./generate-input";

/**
 * Every model Studio offers, the one place model ids live. Checked against
 * the providers' docs on 2026-11-05 (OpenAI images reference and models page;
 * Google AI Studio models, image, Omni and pricing pages). Providers retire
 * models often: change them here.
 *
 *   OpenAI video (Sora) shut down on 2026-09-24, and Google's Veo 3.1 on
 *   2026-10-22 (Gemini Omni Flash replaces it), so video is Google only.
 *
 * `costUsd` is the provider's price for one unit (one image at the smallest
 * size / medium quality, one video run, one text run) until an admin sets the
 * real figure in Settings; options multiply it by their `factor`.
 */
export type Provider = "google" | "openai";
export type ModelTool = "IMAGE" | "VIDEO" | "TEXT";
type Choice = { id: string; label: string; factor: number };

export type StudioModel = {
  id: string;
  provider: Provider;
  tool: ModelTool;
  name: string;
  /** What it's best at, in a few words */
  blurb: string;
  costUsd: number;
  isDefault?: boolean;
  /** Images: the ratios it makes, its sizes or qualities, and how many in one run */
  ratios?: readonly string[];
  sizes?: readonly Choice[];
  qualities?: readonly Choice[];
  maxCount?: number;
  /** Video: resolutions */
  resolutions?: readonly Choice[];
};

const GEMINI_RATIOS = ["1:1", "3:4", "4:3", "9:16", "16:9", "21:9"] as const;
/** OpenAI images: square, wide, tall (1024×1024, 1536×1024, 1024×1536). */
export const OPENAI_SIZES: Record<string, string> = {
  "1:1": "1024x1024",
  "3:2": "1536x1024",
  "2:3": "1024x1536",
};
// gpt-image-2 per-image prices at 1024×1024: low $0.006, medium $0.053, high $0.211.
const GPT_QUALITIES = [
  { id: "low", label: "Draft", factor: 0.12 },
  { id: "medium", label: "Standard", factor: 1 },
  { id: "high", label: "High", factor: 4 },
] as const;

export const MODELS: readonly StudioModel[] = [
  // Images
  {
    id: "gemini-nano-banana-2.1",
    provider: "google",
    tool: "IMAGE",
    name: "Nano Banana 2.1",
    blurb: "Fast and cheap, great for covers and posters",
    costUsd: 0.0336,
    isDefault: true,
    ratios: GEMINI_RATIOS,
    // $0.0336 at 1K, $0.0504 at 2K, $0.113 at 4K
    sizes: [
      { id: "1K", label: "1K", factor: 1 },
      { id: "2K", label: "2K", factor: 1.5 },
      { id: "4K", label: "4K", factor: 3.4 },
    ],
    maxCount: 4,
  },
  {
    id: "gemini-3-pro-image",
    provider: "google",
    tool: "IMAGE",
    name: "Nano Banana Pro",
    blurb: "Google's most detailed images, sharp text in the picture",
    costUsd: 0.134,
    ratios: GEMINI_RATIOS,
    // $0.134 at 1K and 2K, $0.24 at 4K
    sizes: [
      { id: "1K", label: "1K", factor: 1 },
      { id: "2K", label: "2K", factor: 1 },
      { id: "4K", label: "4K", factor: 1.8 },
    ],
    maxCount: 4,
  },
  {
    id: "gpt-image-2.6-flare",
    provider: "openai",
    tool: "IMAGE",
    name: "GPT Image 2.6 Flare",
    blurb: "OpenAI's fast image model, for quick ideas",
    costUsd: 0.053,
    ratios: Object.keys(OPENAI_SIZES),
    qualities: GPT_QUALITIES,
    maxCount: 4,
  },
  {
    id: "gpt-image-2.6-sunburst",
    provider: "openai",
    tool: "IMAGE",
    name: "GPT Image 2.6 Sunburst",
    blurb: "OpenAI's most careful images, rich detail",
    costUsd: 0.053,
    ratios: Object.keys(OPENAI_SIZES),
    qualities: GPT_QUALITIES,
    maxCount: 4,
  },
  // Video
  {
    id: "gemini-omni-1.1-flash",
    provider: "google",
    tool: "VIDEO",
    name: "Gemini Omni Flash",
    blurb: "Short clips with sound, for posts and promos",
    // about $0.10 a second at 720p; an ~8 second clip
    costUsd: 0.8,
    isDefault: true,
    ratios: ["16:9", "9:16"],
    resolutions: [
      { id: "720p", label: "720p", factor: 1 },
      { id: "1080p", label: "1080p", factor: 1.5 },
    ],
  },
  // Writing (text, SEO and social posts)
  {
    id: "gemini-3.8-flash",
    provider: "google",
    tool: "TEXT",
    name: "Gemini 3.8 Flash",
    blurb: "Quick, clear writing",
    costUsd: 0.003,
    isDefault: true,
  },
  {
    id: "gemini-4-argon",
    provider: "google",
    tool: "TEXT",
    name: "Gemini 4 Argon",
    blurb: "Google's best writer, for long pieces",
    costUsd: 0.01,
  },
  {
    id: "gpt-6-luna",
    provider: "openai",
    tool: "TEXT",
    name: "GPT-6 Luna",
    blurb: "OpenAI's quick writer",
    costUsd: 0.002,
  },
  {
    id: "gpt-6.1-sol",
    provider: "openai",
    tool: "TEXT",
    name: "GPT-6.1 Sol",
    blurb: "OpenAI's balanced writer, more depth",
    costUsd: 0.01,
  },
];

/** The model a tool's runs use: SEO and social posts are written by the text models. */
const PROVIDER_KEY: Record<Provider, string> = {
  google: "GEMINI_API_KEY",
  openai: "OPENAI_API_KEY",
};

/** Whether a provider has its API key here (a model of a provider without one can't run). */
export function providerReady(
  provider: Provider,
  env: Record<string, string | undefined> = process.env,
) {
  return Boolean(env[PROVIDER_KEY[provider]]?.trim());
}

export const modelToolOf = (tool: GenerateInput["tool"]): ModelTool =>
  tool === "SEO" || tool === "SOCIAL" ? "TEXT" : tool;

export const defaultModel = (tool: GenerateInput["tool"]) =>
  MODELS.find((model) => model.tool === modelToolOf(tool) && model.isDefault)!;

export const modelOf = (tool: GenerateInput["tool"], id: string) =>
  MODELS.find((model) => model.id === id && model.tool === modelToolOf(tool));

const WHAT: Record<ModelTool, string> = { IMAGE: "images", VIDEO: "videos", TEXT: "writing" };
const refuse = (message: string) => new AppError(ErrorCodes.VALIDATION_FAILED, { message });

/** The chosen model, or a plain refusal when the run asks for something it can't do. */
export function checkOptions(input: GenerateInput): StudioModel {
  const model = modelOf(input.tool, input.model);
  if (!model)
    throw refuse(
      `That model can't ${modelToolOf(input.tool) === "TEXT" ? "write this" : `make ${WHAT[modelToolOf(input.tool)]}`}.`,
    );
  if (input.tool === "IMAGE") {
    if (!model.ratios?.includes(input.aspectRatio))
      throw refuse(`${model.name} can't make ${input.aspectRatio}.`);
    if (input.count > (model.maxCount ?? 1))
      throw refuse(`${model.name} makes up to ${model.maxCount ?? 1} images at a time.`);
    if (input.size && !model.sizes?.some((size) => size.id === input.size))
      throw refuse(`${model.name} doesn't offer ${input.size}.`);
    if (input.quality && !model.qualities?.some((quality) => quality.id === input.quality))
      throw refuse(`${model.name} doesn't offer that quality.`);
  }
  if (input.tool === "VIDEO") {
    if (!model.ratios?.includes(input.aspectRatio))
      throw refuse(`${model.name} can't make ${input.aspectRatio}.`);
    if (input.resolution && !model.resolutions?.some((entry) => entry.id === input.resolution))
      throw refuse(`${model.name} doesn't offer ${input.resolution}.`);
  }
  return model;
}
