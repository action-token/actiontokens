import { AppError, ErrorCodes } from "@actiontokens/errors";

import type { Context } from "../../context";
import { queueRedo } from "../media/processing";
import { checkOwnUrls, invalid } from "./items";

/**
 * The stems (vocals, drums, bass…) of a song. Owners mix them in the player; everyone
 * else hears the first 30 seconds of each. Adding or removing a stem is allowed any
 * time, including after sales: owners simply get the new set.
 */
type ServiceCtx = Pick<Context, "db" | "activity">;

export const MAX_STEMS = 8;
const MAX_STEM_SECONDS = 6 * 60 * 60;

/** The mixer's colours, in order; a song's stems take them one after another. */
export const STEM_COLORS = [
  "#dbdc2c",
  "#5ad0c0",
  "#ff8a5b",
  "#9b8cff",
  "#ff6b9d",
  "#6bd36b",
  "#4da3ff",
  "#f2c14e",
] as const;

async function ownSong(ctx: ServiceCtx, organization: { id: string }, itemId: string) {
  const song = await ctx.db.item.findFirst({
    where: { id: itemId, organizationId: organization.id, deletedAt: null, type: "TRACK" },
    select: { id: true, media: { select: { durationSec: true } } },
  });
  if (!song) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Song not found" });
  ctx.activity.set({ targetType: "Item", targetId: song.id });
  return song;
}

async function ownStem(ctx: ServiceCtx, organization: { id: string }, stemId: string) {
  const stem = await ctx.db.itemStem.findFirst({
    where: { id: stemId, item: { organizationId: organization.id, deletedAt: null } },
    select: { id: true, itemId: true },
  });
  if (!stem) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Stem not found" });
  ctx.activity.set({ targetType: "Item", targetId: stem.itemId ?? undefined });
  return stem;
}

export async function listStems(ctx: ServiceCtx, organization: { id: string }, itemId: string) {
  await ownSong(ctx, organization, itemId);
  const rows = await ctx.db.itemStem.findMany({
    where: { itemId },
    orderBy: [{ trackIndex: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true, color: true, trackIndex: true, endSec: true },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    color: row.color,
    durationSec: row.endSec,
  }));
}

export async function addStem(
  ctx: ServiceCtx,
  organization: { id: string },
  input: { itemId: string; name: string; audio: { url: string; durationSec: number } },
) {
  const song = await ownSong(ctx, organization, input.itemId);
  const name = input.name.trim();
  if (name.length === 0 || name.length > 30) throw invalid("Name the stem, for example Vocals.");
  checkOwnUrls({ file: input.audio.url });
  if (
    !Number.isInteger(input.audio.durationSec) ||
    input.audio.durationSec < 1 ||
    input.audio.durationSec > MAX_STEM_SECONDS
  ) {
    throw invalid("We couldn't read the stem's length. Try the file again.");
  }
  const count = await ctx.db.itemStem.count({ where: { itemId: song.id } });
  if (count >= MAX_STEMS)
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, {
      message: `A song can have up to ${MAX_STEMS} stems.`,
    });

  const last = await ctx.db.itemStem.aggregate({
    where: { itemId: song.id },
    _max: { trackIndex: true },
  });
  const trackIndex = (last._max.trackIndex ?? -1) + 1;
  const stem = await ctx.db.itemStem.create({
    data: {
      itemId: song.id,
      name,
      sourceUrl: input.audio.url,
      color: STEM_COLORS[count % STEM_COLORS.length]!,
      trackIndex,
      endSec: input.audio.durationSec,
    },
    select: { id: true },
  });
  await queueRedo(ctx.db, song.id, "stems");
  return { stemId: stem.id };
}

export async function updateStem(
  ctx: ServiceCtx,
  organization: { id: string },
  input: { stemId: string; name?: string; color?: string },
) {
  const stem = await ownStem(ctx, organization, input.stemId);
  if (input.color !== undefined && !/^#[0-9a-fA-F]{6}$/.test(input.color))
    throw invalid("Pick a colour.");
  if (input.name !== undefined && (input.name.trim().length === 0 || input.name.trim().length > 30))
    throw invalid("Name the stem, for example Vocals.");
  const data = {
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.color !== undefined ? { color: input.color } : {}),
  };
  if (Object.keys(data).length > 0) await ctx.db.itemStem.update({ where: { id: stem.id }, data });
  return { stemId: stem.id };
}

export async function removeStem(ctx: ServiceCtx, organization: { id: string }, stemId: string) {
  const stem = await ownStem(ctx, organization, stemId);
  await ctx.db.itemStem.delete({ where: { id: stem.id } });
  return { stemId: stem.id };
}
