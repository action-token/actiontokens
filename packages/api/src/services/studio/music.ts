import { AppError, ErrorCodes, isAppError } from "@bandcoin/errors";
import { uploadBufferToS3 } from "@bandcoin/storage";

import type { Context, SessionUser } from "../../context";
import { enqueueJob } from "../jobs/queue";
import { holdCoins, settleHold } from "./balance";
import { type MusicKind, MUSIC_MODELS, type MusicProvider } from "./lyria";
import { loadPricing, priceList } from "./pricing";

/**
 * Studio's music runs: a clip or a full song from a prompt. Starting one
 * prices it, holds the coins and queues it for the worker (a song can take
 * minutes). The worker asks Lyria, saves the audio to storage and keeps the
 * coins; if anything fails the coins come back. Nothing is retried, so a run
 * is never paid for twice.
 */
type ServiceCtx = Pick<Context, "db" | "activity">;

const TOOL: Record<MusicKind, "MUSIC_CLIP" | "MUSIC_SONG"> = {
  CLIP: "MUSIC_CLIP",
  SONG: "MUSIC_SONG",
};
const LABEL: Record<MusicKind, string> = { CLIP: "Music clip", SONG: "Full song" };
export const MAX_PROMPT = 2000;
/** A run not finished after this long belonged to a worker that stopped: refunded. */
export const STUCK_AFTER_MS = 20 * 60_000;

export type MusicOutput = { type: "audio"; url: string; mimeType: string; lyrics: string | null };

export async function startMusic(
  ctx: ServiceCtx,
  user: SessionUser,
  input: { kind: MusicKind; prompt: string },
) {
  const prompt = input.prompt.trim();
  if (prompt.length < 3 || prompt.length > MAX_PROMPT)
    throw new AppError(ErrorCodes.VALIDATION_FAILED, {
      message: `Describe the music in 3 to ${MAX_PROMPT.toLocaleString("en-US")} characters.`,
    });
  const coins = priceList(await loadPricing(ctx))[TOOL[input.kind]];
  const artist = await ctx.db.artist.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });
  const generation = await ctx.db.generation.create({
    data: {
      userId: user.id,
      artistId: artist?.id ?? null,
      type: "MUSIC",
      prompt,
      model: MUSIC_MODELS[input.kind],
      status: "QUEUED",
      cost: coins,
      message: LABEL[input.kind],
    },
    select: { id: true },
  });
  ctx.activity.set({ targetType: "Generation", targetId: generation.id, amount: String(coins) });
  try {
    await holdCoins(ctx, {
      userId: user.id,
      generationId: generation.id,
      coins,
      note: `${LABEL[input.kind]}: ${prompt.slice(0, 80)}`,
    });
  } catch (error) {
    // Not enough coins: the run never starts.
    await ctx.db.generation.delete({ where: { id: generation.id } });
    throw error;
  }
  await enqueueJob(ctx.db, "studio.music", { generationId: generation.id }, { maxAttempts: 1 });
  return { generationId: generation.id, coins };
}

async function heldEntry(ctx: Pick<Context, "db">, generationId: string) {
  const entry = await ctx.db.studioLedgerEntry.findFirst({
    where: { generationId, kind: "SPEND", status: "PENDING" },
    select: { id: true },
  });
  return entry?.id ?? null;
}

/** Ends a run that didn't work and gives its coins back (once). */
async function failRun(ctx: Pick<Context, "db">, generationId: string, reason: string) {
  await ctx.db.generation.update({
    where: { id: generationId },
    data: { status: "FAILED", error: reason.slice(0, 500), progress: null },
  });
  const entryId = await heldEntry(ctx, generationId);
  if (entryId)
    await settleHold(ctx, {
      entryId,
      outcome: "REFUND",
      note: "The run didn't work, so its coins came back.",
    });
}

/** The worker's `studio.music`: one queued run, start to finish. */
export async function runMusic(
  ctx: Pick<Context, "db">,
  generationId: string,
  deps: { provider: MusicProvider; upload?: typeof uploadBufferToS3 },
) {
  // Take the run once: a second worker finds it already running.
  const { count } = await ctx.db.generation.updateMany({
    where: { id: generationId, status: "QUEUED" },
    data: { status: "RUNNING", progress: 10 },
  });
  if (count !== 1) return { generationId, outcome: "SKIPPED" as const };
  const generation = await ctx.db.generation.findUniqueOrThrow({
    where: { id: generationId },
    select: { prompt: true, model: true },
  });
  const kind: MusicKind = generation.model === MUSIC_MODELS.SONG ? "SONG" : "CLIP";
  try {
    const result = await deps.provider.generate({ kind, prompt: generation.prompt });
    const url = await (deps.upload ?? uploadBufferToS3)(result.audio, result.mimeType, {
      keyPrefix: "studio-music-",
    });
    const outputs: MusicOutput[] = [
      { type: "audio", url, mimeType: result.mimeType, lyrics: result.lyrics },
    ];
    await ctx.db.generation.update({
      where: { id: generationId },
      data: { status: "SUCCEEDED", progress: 100, outputs },
    });
    const entryId = await heldEntry(ctx, generationId);
    if (entryId) await settleHold(ctx, { entryId, outcome: "KEEP" });
    return { generationId, outcome: "DONE" as const, url };
  } catch (error) {
    const reason =
      isAppError(error) && error.message
        ? error.message
        : "The music service had a problem. Your coins came back; try again in a moment.";
    console.error("[studio] music run failed", { generationId, error });
    await failRun(ctx, generationId, reason);
    return { generationId, outcome: "FAILED" as const, reason };
  }
}

/** Runs a stopped worker left behind: failed and refunded, so coins are never held forever. */
export async function sweepStuckRuns(ctx: Pick<Context, "db">, now = new Date()) {
  const stuck = await ctx.db.generation.findMany({
    where: {
      status: { in: ["QUEUED", "RUNNING"] },
      updatedAt: { lt: new Date(now.getTime() - STUCK_AFTER_MS) },
    },
    select: { id: true },
    take: 100,
  });
  for (const { id } of stuck)
    await failRun(ctx, id, "This run took too long and was stopped. Your coins came back.");
  return { refunded: stuck.length };
}

const generationSelect = {
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
} as const;

const shaped = (row: {
  cost: { toString(): string };
  outputs: unknown;
  [key: string]: unknown;
}) => ({
  ...row,
  cost: Number(row.cost.toString()),
  outputs: (row.outputs ?? []) as MusicOutput[],
});

/** One of your runs, to watch it finish. */
export async function getGeneration(
  ctx: Pick<Context, "db">,
  user: SessionUser,
  generationId: string,
) {
  const row = await ctx.db.generation.findFirst({
    where: { id: generationId, userId: user.id },
    select: generationSelect,
  });
  if (!row) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Run not found" });
  return shaped(row);
}

/** Your latest music runs, newest first. */
export async function recentMusic(ctx: Pick<Context, "db">, user: SessionUser) {
  const rows = await ctx.db.generation.findMany({
    where: { userId: user.id, type: "MUSIC" },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: generationSelect,
  });
  return rows.map(shaped);
}
