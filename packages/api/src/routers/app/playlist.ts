import { z } from "zod";

import type { Db } from "@bandcoin/db";
import { AppError, ErrorCodes } from "@bandcoin/errors";

import { itemCardSelect, listedItemWhere, toItemCard } from "../../services/catalog/item-card";
import { authedProcedure, createRouter, publicProcedure } from "../../trpc";

const MAX_TRACKS = 500;
const name = z.string().trim().min(1, "Give it a name").max(80);
const playlistInput = z.object({ playlistId: z.string().min(1) });

/** The playlist, if `userId` owns it; otherwise "not found" (never reveals private ones). */
async function ownPlaylist(db: Db, userId: string, playlistId: string) {
  const playlist = await db.playlist.findUnique({
    where: { id: playlistId },
    select: { id: true, ownerId: true },
  });
  if (playlist?.ownerId !== userId)
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Playlist not found." });
  return playlist;
}

/** Up to four covers for the playlist's mosaic. */
const coverSelect = {
  tracks: {
    orderBy: { sortOrder: "asc" },
    take: 4,
    select: { item: { select: { coverUrl: true } } },
  },
  _count: { select: { tracks: true } },
} as const;

const duplicateName = (error: unknown) =>
  error instanceof Error && "code" in error && (error as { code?: string }).code === "P2002";

export const playlistRouter = createRouter({
  /** Your playlists, most recently changed first, with mosaic covers. */
  mine: authedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.playlist.findMany({
      where: { ownerId: ctx.session.user.id },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, isPublic: true, coverUrl: true, ...coverSelect },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      isPublic: row.isPublic,
      covers: row.coverUrl ? [row.coverUrl] : row.tracks.map((track) => track.item.coverUrl),
      trackCount: row._count.tracks,
    }));
  }),

  /** One playlist and its songs. Private playlists are visible to their owner only. */
  byId: publicProcedure.input(playlistInput).query(async ({ ctx, input }) => {
    const viewerId = ctx.session?.user.id;
    const playlist = await ctx.db.playlist.findUnique({
      where: { id: input.playlistId },
      select: {
        id: true,
        name: true,
        description: true,
        isPublic: true,
        coverUrl: true,
        updatedAt: true,
        owner: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        tracks: {
          where: { item: listedItemWhere },
          orderBy: { sortOrder: "asc" },
          take: MAX_TRACKS,
          select: { item: { select: itemCardSelect } },
        },
      },
    });
    if (!playlist || (!playlist.isPublic && playlist.owner.id !== viewerId)) {
      throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Playlist not found." });
    }
    const tracks = playlist.tracks.map((track) => toItemCard(track.item));
    const { id: ownerId, ...owner } = playlist.owner;
    return {
      ...playlist,
      owner,
      isOwner: ownerId === viewerId,
      tracks,
      covers: playlist.coverUrl
        ? [playlist.coverUrl]
        : tracks.slice(0, 4).map((track) => track.coverUrl),
      durationSec: tracks.reduce((sum, track) => sum + (track.durationSec ?? 0), 0),
    };
  }),

  create: authedProcedure
    .input(
      z.object({
        name,
        description: z.string().trim().max(300).optional(),
        isPublic: z.boolean().default(true),
        itemId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const playlist = await ctx.db.playlist.create({
          data: {
            ownerId: ctx.session.user.id,
            name: input.name,
            description: input.description,
            isPublic: input.isPublic,
            ...(input.itemId ? { tracks: { create: { itemId: input.itemId, sortOrder: 0 } } } : {}),
          },
          select: { id: true, name: true },
        });
        ctx.activity.set({ targetType: "Playlist", targetId: playlist.id });
        return playlist;
      } catch (error) {
        if (duplicateName(error))
          throw new AppError(ErrorCodes.RESOURCE_CONFLICT, {
            message: "You already have a playlist with that name.",
          });
        throw error;
      }
    }),

  update: authedProcedure
    .input(
      playlistInput.extend({
        name: name.optional(),
        description: z.string().trim().max(300).nullable().optional(),
        isPublic: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ownPlaylist(ctx.db, ctx.session.user.id, input.playlistId);
      ctx.activity.set({ targetType: "Playlist", targetId: input.playlistId });
      const { playlistId, ...data } = input;
      try {
        return await ctx.db.playlist.update({
          where: { id: playlistId },
          data,
          select: { id: true, name: true, isPublic: true },
        });
      } catch (error) {
        if (duplicateName(error))
          throw new AppError(ErrorCodes.RESOURCE_CONFLICT, {
            message: "You already have a playlist with that name.",
          });
        throw error;
      }
    }),

  delete: authedProcedure.input(playlistInput).mutation(async ({ ctx, input }) => {
    await ownPlaylist(ctx.db, ctx.session.user.id, input.playlistId);
    ctx.activity.set({ targetType: "Playlist", targetId: input.playlistId });
    await ctx.db.playlist.delete({ where: { id: input.playlistId } });
    return { deleted: true };
  }),

  /** Add any song (owned or not) to the end. Adding one that's already there is a no-op. */
  addTrack: authedProcedure
    .input(playlistInput.extend({ itemId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await ownPlaylist(ctx.db, ctx.session.user.id, input.playlistId);
      ctx.activity.set({ targetType: "Playlist", targetId: input.playlistId });
      const item = await ctx.db.item.findFirst({
        where: { id: input.itemId, type: "TRACK", ...listedItemWhere },
        select: { id: true },
      });
      if (!item)
        throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, {
          message: "Only songs can go in a playlist.",
        });
      const [count, last] = await Promise.all([
        ctx.db.playlistTrack.count({ where: { playlistId: input.playlistId } }),
        ctx.db.playlistTrack.findFirst({
          where: { playlistId: input.playlistId },
          orderBy: { sortOrder: "desc" },
          select: { sortOrder: true },
        }),
      ]);
      if (count >= MAX_TRACKS)
        throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, {
          message: `A playlist holds up to ${MAX_TRACKS} songs.`,
        });
      await ctx.db.playlistTrack.upsert({
        where: { playlistId_itemId: { playlistId: input.playlistId, itemId: input.itemId } },
        create: {
          playlistId: input.playlistId,
          itemId: input.itemId,
          sortOrder: (last?.sortOrder ?? -1) + 1,
        },
        update: {},
      });
      await ctx.db.playlist.update({
        where: { id: input.playlistId },
        data: { updatedAt: new Date() },
      });
      return { added: true };
    }),

  removeTrack: authedProcedure
    .input(playlistInput.extend({ itemId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await ownPlaylist(ctx.db, ctx.session.user.id, input.playlistId);
      ctx.activity.set({ targetType: "Playlist", targetId: input.playlistId });
      await ctx.db.playlistTrack.deleteMany({
        where: { playlistId: input.playlistId, itemId: input.itemId },
      });
      return { removed: true };
    }),
});
