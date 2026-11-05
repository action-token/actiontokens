import { z } from "zod";

import { MODELS } from "./models";

/**
 * What each generator takes. Everything has a sensible default, and the
 * strings are capped so a prompt can't run away with the provider's bill.
 */
export const IMAGE_RATIOS = ["1:1", "3:4", "4:3", "9:16", "16:9", "21:9", "3:2", "2:3"] as const;
export const VIDEO_RATIOS = ["16:9", "9:16"] as const;

/** A model id, defaulting to the tool's default (checked against the catalog when the run starts). */
const model = (tool: "IMAGE" | "VIDEO" | "TEXT") =>
  z
    .string()
    .trim()
    .min(1)
    .max(80)
    .default(MODELS.find((entry) => entry.tool === tool && entry.isDefault)!.id);
export const MAX_PROMPT = 2000;

const text = (max: number) => z.string().trim().max(max);
const prompt = z.string().trim().min(3).max(MAX_PROMPT);

export const imageInput = z.object({
  tool: z.literal("IMAGE"),
  model: model("IMAGE"),
  prompt,
  aspectRatio: z.enum(IMAGE_RATIOS).default("1:1"),
  style: text(60).default(""),
  /** How many images in one run */
  count: z.number().int().min(1).max(4).default(1),
  /** Google: 1K / 2K / 4K */
  size: z.enum(["1K", "2K", "4K"]).optional(),
  /** OpenAI: low / medium / high */
  quality: z.enum(["low", "medium", "high"]).optional(),
});

export const videoInput = z.object({
  tool: z.literal("VIDEO"),
  model: model("VIDEO"),
  prompt,
  aspectRatio: z.enum(VIDEO_RATIOS).default("16:9"),
  resolution: z.enum(["720p", "1080p"]).optional(),
});

export const textInput = z.object({
  tool: z.literal("TEXT"),
  model: model("TEXT"),
  prompt,
});

export const seoInput = z.object({
  tool: z.literal("SEO"),
  model: model("TEXT"),
  topic: text(300).min(3),
  primaryKeyword: text(100).default(""),
  secondaryKeywords: z.array(text(100)).max(10).default([]),
  contentType: text(60).default("blog post"),
  tone: text(60).default("professional"),
  wordCount: z.number().int().min(100).max(3000).default(800),
  targetAudience: text(120).default("general readers"),
  readingLevel: text(60).default("general"),
  contentStructure: text(60).default("headings and short paragraphs"),
  searchIntent: text(60).default("informational"),
  keywordDensity: z.number().min(0).max(5).default(1.5),
  language: text(40).default("English"),
  includeMetaTags: z.boolean().default(true),
  includeFAQ: z.boolean().default(false),
  includeTableOfContents: z.boolean().default(false),
  includeInternalLinks: z.boolean().default(false),
  includeStats: z.boolean().default(false),
  includeQuotes: z.boolean().default(false),
});

export const SOCIAL_PLATFORMS = [
  "Instagram",
  "Facebook",
  "X",
  "LinkedIn",
  "TikTok",
  "Threads",
] as const;

export const socialInput = z.object({
  tool: z.literal("SOCIAL"),
  model: model("TEXT"),
  topic: text(300).min(3),
  context: text(1000).default(""),
  platform: z.enum(SOCIAL_PLATFORMS).default("Instagram"),
  postStyle: text(60).default("friendly"),
  postLength: z.enum(["short", "medium", "long", "thread"]).default("medium"),
  numberOfVariations: z.number().int().min(1).max(5).default(3),
  contentPillar: text(60).default("announcement"),
  hookStyle: text(60).default("question"),
  targetDemographic: text(120).default("music fans"),
  includeHashtags: z.boolean().default(true),
  hashtagCount: z.number().int().min(0).max(15).default(5),
  includeEmojis: z.boolean().default(true),
  includeCTA: z.boolean().default(true),
  ctaType: text(60).default("follow"),
});

export const generateInput = z.discriminatedUnion("tool", [
  imageInput,
  videoInput,
  textInput,
  seoInput,
  socialInput,
]);
export type GenerateInput = z.infer<typeof generateInput>;
export type GenerateTool = GenerateInput["tool"];
