import { createHmac, timingSafeEqual } from "node:crypto";

import { AppError, ErrorCodes } from "@bandcoin/errors";
import { isOwnS3Url } from "@bandcoin/storage";

import type { Context, SessionUser } from "../../context";
import { holdCoins, settleHold } from "./balance";
import { loadPricing, priceList } from "./pricing";

/**
 * Live Lyria jams, billed per started minute of playing. The browser connects
 * to the worker's relay with a short-lived ticket signed here (bandfan let the
 * browser say which user it was). Each minute's coins are held when it starts
 * and kept once music arrives in it; a minute that never got music is
 * refunded. Pausing stops the clock.
 */
type Db = Pick<Context, "db">;

export const LIVE_MODEL = "lyria-realtime-exp";
export const LIVE_TICKET_SECONDS = 60;
export const LIVE_MAX_MINUTES = 30;

const secret = () => {
  const value = process.env.LIVE_TICKET_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!value)
    throw new AppError(ErrorCodes.CONFIG_MISSING, { message: "Live music isn't set up yet." });
  return value;
};
const sign = (payload: string) =>
  createHmac("sha256", secret()).update(payload).digest("base64url");

/** A ticket for one connection: who, until when (a minute), signed. */
export function liveTicket(userId: string, now = Date.now()) {
  const payload = Buffer.from(
    JSON.stringify({ u: userId, e: now + LIVE_TICKET_SECONDS * 1000 }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** The user a ticket is for, or null when it's forged or expired. */
export function readTicket(ticket: string | null | undefined, now = Date.now()) {
  const [payload, signature] = (ticket ?? "").split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const { u, e } = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      u?: unknown;
      e?: unknown;
    };
    return typeof u === "string" && typeof e === "number" && e > now ? u : null;
  } catch {
    return null;
  }
}

export async function livePrice(ctx: Db) {
  return priceList(await loadPricing(ctx)).MUSIC_LIVE;
}

/** A live session shows in your music like any run. */
export async function startLiveRun(ctx: Db, userId: string) {
  const artist = await ctx.db.artist.findUnique({ where: { userId }, select: { id: true } });
  const run = await ctx.db.generation.create({
    data: {
      userId,
      artistId: artist?.id ?? null,
      type: "MUSIC",
      prompt: "Live jam",
      model: LIVE_MODEL,
      status: "RUNNING",
      cost: 0,
      progress: 0,
      message: "Live session",
    },
    select: { id: true },
  });
  return run.id;
}

/** Holds the next minute's coins; throws "not enough coins" when it can't. */
export async function holdLiveMinute(
  ctx: Db,
  input: { userId: string; generationId: string; minute: number; coins: number },
) {
  const { entryId } = await holdCoins(ctx, {
    userId: input.userId,
    generationId: input.generationId,
    coins: input.coins,
    note: `Live jam: minute ${input.minute}`,
  });
  await ctx.db.generation.update({
    where: { id: input.generationId },
    data: { cost: { increment: input.coins }, progress: input.minute },
  });
  return entryId;
}

/** Music arrived in this minute: its coins are kept. */
export const keepLiveMinute = (ctx: Db, entryId: string) =>
  settleHold(ctx, { entryId, outcome: "KEEP" });

/** No music came in this minute: its coins come back. */
export async function refundLiveMinute(
  ctx: Db,
  entryId: string,
  generationId: string,
  coins: number,
) {
  const { settled } = await settleHold(ctx, {
    entryId,
    outcome: "REFUND",
    note: "No music came in this minute, so its coins came back.",
  });
  if (settled)
    await ctx.db.generation.update({
      where: { id: generationId },
      data: { cost: { decrement: coins } },
    });
}

export async function endLiveRun(ctx: Db, generationId: string, error?: string) {
  await ctx.db.generation.updateMany({
    where: { id: generationId, status: "RUNNING" },
    data: error ? { status: "FAILED", error: error.slice(0, 500) } : { status: "SUCCEEDED" },
  });
}

/** Keeps a recording of your jam with its live run, so it's in your music and the mixer. */
export async function saveLiveRecording(
  ctx: Db,
  user: SessionUser,
  input: { generationId: string; url: string },
) {
  if (!isOwnS3Url(input.url))
    throw new AppError(ErrorCodes.VALIDATION_FAILED, { message: "Upload the recording again." });
  const { count } = await ctx.db.generation.updateMany({
    where: { id: input.generationId, userId: user.id, model: LIVE_MODEL },
    data: {
      outputs: [{ type: "audio", url: input.url, mimeType: "audio/wav", lyrics: null }],
      status: "SUCCEEDED",
    },
  });
  if (count !== 1)
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Live session not found" });
  return { generationId: input.generationId };
}
