import crypto from "node:crypto";

import { AppError, ErrorCodes } from "@bandcoin/errors";
import { latestPreviewStart, PREVIEW_SECONDS } from "@bandcoin/utils/preview";
import { slugFromName } from "@bandcoin/utils/slug";

import type { Context } from "../../context";
import { checkOwnUrls, type CreateItemInput, createItem, invalid } from "./items";

/**
 * The artist's music: songs (classic tokens with audio and a preview), and the
 * albums that group them. Songs reuse the collectible rules (price, supply, code,
 * locks after the first sale) through `createItem` and `updateItem`; this adds what
 * only music has: the audio, where the 30-second preview starts, the album and the
 * credited name. Songs are classic tokens only: contract-NFT checkout isn't open.
 */
type ServiceCtx = Pick<Context, "db" | "activity">;
type ArtistRef = { id: string; slug: string; name: string; issuerAccountId: string | null };

const MAX_SONG_SECONDS = 6 * 60 * 60;

function checkPreview(startSec: number, durationSec: number) {
  if (!Number.isFinite(startSec) || startSec < 0 || startSec > latestPreviewStart(durationSec)) {
    throw invalid(`Pick a preview that starts at least ${PREVIEW_SECONDS} seconds before the end.`);
  }
}

async function ownAlbum(db: ServiceCtx["db"], artistId: string, albumId: string) {
  const album = await db.album.findFirst({
    where: { id: albumId, artistId },
    select: { id: true },
  });
  if (!album) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Album not found" });
  return album;
}

export type CreateSongInput = Omit<
  CreateItemInput,
  "type" | "media" | "track" | "royaltyPercent"
> & {
  audio: { url: string; durationSec: number };
  /** Where the 30-second preview starts, in seconds */
  previewStartSec: number;
  albumId?: string;
  trackNumber?: number;
  /** The name shown as the artist, when it isn't just the artist's own (a feature, a band alias) */
  artistName?: string;
};

export async function createSong(
  ctx: ServiceCtx,
  artist: ArtistRef,
  user: { id: string },
  input: CreateSongInput,
) {
  const { audio, previewStartSec, albumId, trackNumber, artistName, ...rest } = input;
  if (
    !Number.isInteger(audio.durationSec) ||
    audio.durationSec < 1 ||
    audio.durationSec > MAX_SONG_SECONDS
  ) {
    throw invalid("We couldn't read the song's length. Try the file again.");
  }
  checkOwnUrls({ file: audio.url });
  checkPreview(previewStartSec, audio.durationSec);
  if (albumId) await ownAlbum(ctx.db, artist.id, albumId);

  return createItem(ctx, artist, user, {
    ...rest,
    type: "TRACK",
    media: { url: audio.url, mediaType: "AUDIO", durationSec: audio.durationSec, previewStartSec },
    track: { artistName: artistName?.trim() || artist.name, albumId, trackNumber },
  });
}

export async function listSongs(ctx: Pick<ServiceCtx, "db">, artist: Pick<ArtistRef, "id">) {
  const rows = await ctx.db.item.findMany({
    where: { artistId: artist.id, deletedAt: null, type: "TRACK" },
    orderBy: { createdAt: "desc" },
    take: 300,
    select: {
      id: true,
      slug: true,
      title: true,
      coverUrl: true,
      visibility: true,
      supply: true,
      playCount: true,
      createdAt: true,
      classicToken: { select: { code: true } },
      track: {
        select: {
          artistName: true,
          trackNumber: true,
          album: { select: { id: true, title: true } },
        },
      },
      media: { select: { durationSec: true, status: true } },
      listings: {
        where: { kind: "PRIMARY" },
        take: 1,
        select: { priceBandcoin: true, priceUsd: true, status: true, quantitySold: true },
      },
      _count: { select: { stems: true } },
    },
  });
  return rows.map((row) => {
    const listing = row.listings[0];
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      coverUrl: row.coverUrl,
      code: row.classicToken?.code ?? null,
      visibility: row.visibility,
      supply: row.supply,
      plays: row.playCount,
      sold: listing?.quantitySold ?? 0,
      stems: row._count.stems,
      durationSec: row.media?.durationSec ?? null,
      artistName: row.track?.artistName ?? null,
      albumId: row.track?.album?.id ?? null,
      albumTitle: row.track?.album?.title ?? null,
      trackNumber: row.track?.trackNumber ?? null,
      priceBandcoin: listing?.priceBandcoin.toString() ?? null,
      priceUsd: listing?.priceUsd.toString() ?? null,
      listingStatus: listing?.status ?? null,
      createdAt: row.createdAt,
    };
  });
}

/** One song for the edit screen: what the collectible form needs plus the audio and music details. */
export async function getSong(
  ctx: Pick<ServiceCtx, "db">,
  artist: Pick<ArtistRef, "id">,
  itemId: string,
) {
  const song = await ctx.db.item.findFirst({
    where: { id: itemId, artistId: artist.id, deletedAt: null, type: "TRACK" },
    select: {
      id: true,
      title: true,
      description: true,
      coverUrl: true,
      supply: true,
      visibility: true,
      classicToken: { select: { code: true } },
      media: { select: { sourceUrl: true, durationSec: true, previewStartSec: true } },
      track: { select: { artistName: true, trackNumber: true, albumId: true } },
      listings: {
        where: { kind: "PRIMARY" },
        take: 1,
        select: { priceBandcoin: true, priceUsd: true, quantitySold: true },
      },
    },
  });
  if (!song) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Song not found" });
  const listing = song.listings[0];
  const sold = listing?.quantitySold ?? 0;
  return {
    id: song.id,
    title: song.title,
    description: song.description ?? "",
    coverUrl: song.coverUrl,
    code: song.classicToken?.code ?? null,
    supply: song.supply,
    sold,
    /** After the first sale supply and code are fixed */
    locked: sold > 0,
    visibility: song.visibility,
    priceBandcoin: listing?.priceBandcoin.toString() ?? "",
    priceUsd: listing?.priceUsd.toString() ?? "",
    audioUrl: song.media?.sourceUrl ?? null,
    durationSec: song.media?.durationSec ?? 0,
    previewStartSec: song.media?.previewStartSec ?? 0,
    artistName: song.track?.artistName ?? "",
    trackNumber: song.track?.trackNumber ?? null,
    albumId: song.track?.albumId ?? null,
  };
}

export type UpdateSongInput = {
  itemId: string;
  /** null takes the song out of its album */
  albumId?: string | null;
  trackNumber?: number | null;
  artistName?: string;
  previewStartSec?: number;
};

/** The music-only parts of a song. Title, price, supply and visibility go through `updateItem`. */
export async function updateSong(
  ctx: ServiceCtx,
  artist: Pick<ArtistRef, "id">,
  input: UpdateSongInput,
) {
  const song = await ctx.db.item.findFirst({
    where: { id: input.itemId, artistId: artist.id, deletedAt: null, type: "TRACK" },
    select: { id: true, type: true, media: { select: { durationSec: true } } },
  });
  if (!song) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Song not found" });
  ctx.activity.set({ targetType: "Item", targetId: song.id });

  if (input.albumId) await ownAlbum(ctx.db, artist.id, input.albumId);
  if (input.previewStartSec !== undefined)
    checkPreview(input.previewStartSec, song.media?.durationSec ?? 0);

  const track = {
    ...(input.albumId !== undefined ? { albumId: input.albumId } : {}),
    ...(input.trackNumber !== undefined ? { trackNumber: input.trackNumber } : {}),
    ...(input.artistName !== undefined ? { artistName: input.artistName.trim() } : {}),
  };
  await ctx.db.$transaction(async (tx) => {
    if (Object.keys(track).length > 0)
      await tx.track.update({ where: { itemId: song.id }, data: track });
    if (input.previewStartSec !== undefined)
      await tx.itemMedia.update({
        where: { itemId: song.id },
        data: { previewStartSec: input.previewStartSec },
      });
  });
  return { itemId: song.id };
}

export async function listAlbums(ctx: Pick<ServiceCtx, "db">, artist: Pick<ArtistRef, "id">) {
  const rows = await ctx.db.album.findMany({
    where: { artistId: artist.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      coverUrl: true,
      createdAt: true,
      _count: { select: { tracks: true } },
    },
  });
  return rows.map(({ _count, ...row }) => ({ ...row, songCount: _count.tracks }));
}

export async function createAlbum(
  ctx: ServiceCtx,
  artist: Pick<ArtistRef, "id" | "slug">,
  input: { title: string; description?: string; coverUrl: string },
) {
  checkOwnUrls({ cover: input.coverUrl });
  const base = `${artist.slug}-${slugFromName(input.title)}`.slice(0, 80).replace(/-+$/, "");
  const taken = await ctx.db.album.findUnique({ where: { slug: base }, select: { id: true } });
  const slug = taken ? `${base}-${crypto.randomBytes(3).toString("hex").slice(0, 4)}` : base;
  const album = await ctx.db.album.create({
    data: {
      artistId: artist.id,
      title: input.title.trim(),
      slug,
      description: input.description?.trim() || null,
      coverUrl: input.coverUrl,
    },
    select: { id: true, slug: true },
  });
  ctx.activity.set({ targetType: "Album", targetId: album.id });
  return { albumId: album.id, slug: album.slug };
}

export async function updateAlbum(
  ctx: ServiceCtx,
  artist: Pick<ArtistRef, "id">,
  input: { albumId: string; title?: string; description?: string; coverUrl?: string },
) {
  await ownAlbum(ctx.db, artist.id, input.albumId);
  ctx.activity.set({ targetType: "Album", targetId: input.albumId });
  checkOwnUrls({ cover: input.coverUrl });
  const data = {
    ...(input.title !== undefined ? { title: input.title.trim() } : {}),
    ...(input.description !== undefined ? { description: input.description.trim() || null } : {}),
    ...(input.coverUrl !== undefined ? { coverUrl: input.coverUrl } : {}),
  };
  if (Object.keys(data).length > 0)
    await ctx.db.album.update({ where: { id: input.albumId }, data });
  return { albumId: input.albumId };
}

/** Deleting an album only removes the grouping: its songs stay, and carry on as singles. */
export async function deleteAlbum(ctx: ServiceCtx, artist: Pick<ArtistRef, "id">, albumId: string) {
  await ownAlbum(ctx.db, artist.id, albumId);
  ctx.activity.set({ targetType: "Album", targetId: albumId });
  await ctx.db.album.delete({ where: { id: albumId } });
  return { albumId };
}
