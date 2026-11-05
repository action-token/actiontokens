import { AppError, ErrorCodes, isAppError } from "@bandcoin/errors";
import { uploadBufferToS3 } from "@bandcoin/storage";

import type { Context, SessionUser } from "../../context";
import { enqueueJob } from "../jobs/queue";
import { holdCoins } from "./balance";
import type { GenerateInput, GenerateTool } from "./generate-input";
import type { GenerateProvider } from "./google";
import { checkOptions, type Provider } from "./models";
import { loadPricing, runPrice } from "./pricing";
import type { MusicOutput } from "./music";
import { failRun, keepRun } from "./run";
import { seoPrompt, socialPrompt } from "./writing";

/**
 * Studio's image, video and writing runs. Same shape as music: starting one
 * checks the chosen model can do it, prices it, holds the coins and queues it
 * for the worker; the worker asks that model's provider (Google or OpenAI),
 * saves the result and keeps the coins, or gives them back if anything fails.
 * Nothing is retried, so a run is never paid for twice.
 */
type ServiceCtx = Pick<Context, "db" | "activity">;
type Db = Pick<Context, "db">;

export const GENERATE_JOB = "studio.generate";

const LABEL: Record<GenerateTool, string> = {
  IMAGE: "Image",
  VIDEO: "Video",
  TEXT: "Text",
  SEO: "SEO article",
  SOCIAL: "Social posts",
};
const TYPE = {
  IMAGE: "IMAGE",
  VIDEO: "VIDEO",
  TEXT: "TEXT",
  SEO: "SEO",
  SOCIAL: "SOCIAL",
} as const;

export type GenerateOutput =
  { type: "image" | "video"; url: string; mimeType: string } | { type: "text"; text: string };

/** The line shown in history: what you asked for, in a few words. */
const promptOf = (input: GenerateInput) => ("prompt" in input ? input.prompt : input.topic);

/** What the provider is asked, with a chosen style folded in. */
export function providerPrompt(input: GenerateInput) {
  switch (input.tool) {
    case "IMAGE":
      return input.style ? `${input.prompt}, ${input.style} style` : input.prompt;
    case "VIDEO":
    case "TEXT":
      return input.prompt;
    case "SEO":
      return seoPrompt(input);
    case "SOCIAL":
      return socialPrompt(input);
  }
}

export async function startGeneration(ctx: ServiceCtx, user: SessionUser, input: GenerateInput) {
  // Refuses a model or option that doesn't fit before anything is created or held.
  const coins = runPrice(input, await loadPricing(ctx));
  const prompt = promptOf(input);
  const artist = await ctx.db.artist.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });
  const generation = await ctx.db.generation.create({
    data: {
      userId: user.id,
      artistId: artist?.id ?? null,
      type: TYPE[input.tool],
      prompt,
      model: input.model,
      status: "QUEUED",
      cost: coins,
      message: LABEL[input.tool],
    },
    select: { id: true },
  });
  ctx.activity.set({ targetType: "Generation", targetId: generation.id, amount: String(coins) });
  try {
    await holdCoins(ctx, {
      userId: user.id,
      generationId: generation.id,
      coins,
      note: `${LABEL[input.tool]}: ${prompt.slice(0, 80)}`,
    });
  } catch (error) {
    // Not enough coins: the run never starts.
    await ctx.db.generation.delete({ where: { id: generation.id } });
    throw error;
  }
  await enqueueJob(
    ctx.db,
    GENERATE_JOB,
    { generationId: generation.id, input },
    { maxAttempts: 1 },
  );
  return { generationId: generation.id, coins };
}

async function produce(
  provider: GenerateProvider,
  input: GenerateInput,
  upload: typeof uploadBufferToS3,
): Promise<{ outputs: GenerateOutput[]; tokens: number | null }> {
  const prompt = providerPrompt(input);
  const keep = async (media: { bytes: Buffer; mimeType: string }, type: "image" | "video") => ({
    type,
    url: await upload(media.bytes, media.mimeType, { keyPrefix: `studio-${type}-` }),
    mimeType: media.mimeType,
  });
  switch (input.tool) {
    case "IMAGE": {
      const images = await provider.image({
        model: input.model,
        prompt,
        aspectRatio: input.aspectRatio,
        size: input.size,
        quality: input.quality,
        count: input.count,
      });
      return {
        outputs: await Promise.all(images.map((image) => keep(image, "image"))),
        tokens: null,
      };
    }
    case "VIDEO": {
      const video = await provider.video({
        model: input.model,
        prompt,
        aspectRatio: input.aspectRatio,
        resolution: input.resolution,
      });
      return { outputs: [await keep(video, "video")], tokens: null };
    }
    default: {
      const written = await provider.write({ model: input.model, prompt });
      return { outputs: [{ type: "text", text: written.text }], tokens: written.tokens };
    }
  }
}

/** The worker's `studio.generate`: one queued run, start to finish. */
export async function runGeneration(
  ctx: Db,
  generationId: string,
  input: GenerateInput,
  deps: { providers: Record<Provider, GenerateProvider>; upload?: typeof uploadBufferToS3 },
) {
  // Take the run once: a second worker finds it already running.
  const { count } = await ctx.db.generation.updateMany({
    where: { id: generationId, status: "QUEUED" },
    data: {
      status: "RUNNING",
      progress: 10,
      message: input.tool === "VIDEO" ? "Making your video. This takes a few minutes." : undefined,
    },
  });
  if (count !== 1) return { generationId, outcome: "SKIPPED" as const };
  try {
    const { outputs, tokens } = await produce(
      deps.providers[checkOptions(input).provider],
      input,
      deps.upload ?? uploadBufferToS3,
    );
    await ctx.db.generation.update({
      where: { id: generationId },
      data: { status: "SUCCEEDED", progress: 100, outputs, tokensUsed: tokens },
    });
    await keepRun(ctx, generationId);
    return { generationId, outcome: "DONE" as const };
  } catch (error) {
    const reason =
      isAppError(error) && error.message
        ? error.message
        : "The generator had a problem. Your coins came back; try again in a moment.";
    console.error("[studio] run failed", { generationId, tool: input.tool, error });
    await failRun(ctx, generationId, reason);
    return { generationId, outcome: "FAILED" as const, reason };
  }
}

const TYPES = ["IMAGE", "VIDEO", "TEXT", "SEO", "SOCIAL", "MUSIC"] as const;
export type LibraryType = (typeof TYPES)[number];
export const LIBRARY_TYPES = TYPES;
export const LIBRARY_PAGE = 30;

/** Everything you've made, newest first; filter by kind, and page by the last id you saw. */
export async function library(
  ctx: Db,
  user: SessionUser,
  input: { type?: LibraryType; cursor?: string | null },
) {
  const rows = await ctx.db.generation.findMany({
    where: { userId: user.id, ...(input.type ? { type: input.type } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: LIBRARY_PAGE + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      type: true,
      prompt: true,
      model: true,
      status: true,
      progress: true,
      message: true,
      cost: true,
      outputs: true,
      error: true,
      createdAt: true,
    },
  });
  const page = rows.slice(0, LIBRARY_PAGE);
  return {
    items: page.map((row) => ({
      ...row,
      cost: Number(row.cost.toString()),
      // Music runs keep audio; the rest images, videos or text.
      outputs: (row.outputs ?? []) as (GenerateOutput | MusicOutput)[],
    })),
    nextCursor: rows.length > LIBRARY_PAGE ? (page.at(-1)?.id ?? null) : null,
  };
}

/** Removes one of your finished or failed runs from the library (files stay in storage). */
export async function removeGeneration(ctx: Db, user: SessionUser, generationId: string) {
  const { count } = await ctx.db.generation.deleteMany({
    where: { id: generationId, userId: user.id, status: { in: ["SUCCEEDED", "FAILED"] } },
  });
  if (count !== 1) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Run not found" });
  return { generationId };
}
