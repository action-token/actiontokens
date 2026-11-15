import { z } from "zod";

import type { Prisma } from "@bandcoin/db";
import { AppError, ErrorCodes } from "@bandcoin/errors";

import { itemCardSelect, listedItemWhere, toItemCard } from "../../services/catalog/item-card";
import { browseSongs, SONG_OWNERSHIP, SONG_SORTS } from "../../services/catalog/song-browse";
import { authedProcedure, createRouter, publicProcedure } from "../../trpc";

const PAGE_SIZE = 50;
const trackSort = z.enum(["newest", "popular", "title"]).default("newest");
const ORDER = {
  newest: { createdAt: "desc" },
  popular: { playCount: "desc" },
  title: { title: "asc" },
} satisfies Record<z.infer<typeof trackSort>, Prisma.ItemOrderByWithRelationInput>;

const ALBUM_PAGE_SIZE = 24;
const RECENT = 12;
const ALBUM_ORDER = [
  { createdAt: "desc" },
  { id: "asc" },
] satisfies Prisma.AlbumOrderByWithRelationInput[];
const albumCardSelect = {
  id: true,
  title: true,
  slug: true,
  coverUrl: true,
  createdAt: true,
  artist: { select: { name: true, slug: true } },
  _count: { select: { tracks: true } },
} satisfies Prisma.AlbumSelect;

function toAlbumCard({
  _count,
  createdAt,
  id: _id,
  ...album
}: Prisma.AlbumGetPayload<{ select: typeof albumCardSelect }>) {
  return { ...album, year: createdAt.getFullYear(), trackCount: _count.tracks };
}

export const musicRouter = createRouter({
  /** The Music page top: new songs for the carousel and the latest albums. */
  overview: publicProcedure.query(async ({ ctx }) => {
    const [newest, albums] = await Promise.all([
      ctx.db.item.findMany({
        where: { ...listedItemWhere, type: "TRACK" },
        orderBy: { createdAt: "desc" },
        take: 12,
        select: itemCardSelect,
      }),
      ctx.db.album.findMany({
        orderBy: ALBUM_ORDER,
        take: 12,
        select: albumCardSelect,
      }),
    ]);
    return { newest: newest.map(toItemCard), albums: albums.map(toAlbumCard) };
  }),

  /** Every album, newest first, a page at a time: the Home carousel and the Albums page. */
  albums: publicProcedure
    .input(
      z.object({
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const take = input.limit ?? ALBUM_PAGE_SIZE;
      const rows = await ctx.db.album.findMany({
        orderBy: ALBUM_ORDER,
        take: take + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        select: albumCardSelect,
      });
      const hasMore = rows.length > take;
      const page = hasMore ? rows.slice(0, take) : rows;
      return { albums: page.map(toAlbumCard), nextCursor: hasMore ? page.at(-1)?.id : undefined };
    }),

  /** An album and its songs, in track order. */
  album: publicProcedure
    .input(z.object({ slug: z.string().min(1).max(200) }))
    .query(async ({ ctx, input }) => {
      const album = await ctx.db.album.findUnique({
        where: { slug: input.slug },
        select: {
          title: true,
          slug: true,
          description: true,
          coverUrl: true,
          createdAt: true,
          artist: { select: { name: true, slug: true, avatarUrl: true } },
          tracks: {
            where: { item: listedItemWhere },
            orderBy: [{ trackNumber: "asc" }, { item: { createdAt: "asc" } }],
            select: { item: { select: itemCardSelect } },
          },
        },
      });
      if (!album)
        throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "This album doesn't exist." });
      const tracks = album.tracks.map((track) => toItemCard(track.item));
      return {
        title: album.title,
        slug: album.slug,
        description: album.description,
        coverUrl: album.coverUrl,
        year: album.createdAt.getFullYear(),
        artist: album.artist,
        tracks,
        durationSec: tracks.reduce((sum, track) => sum + (track.durationSec ?? 0), 0),
      };
    }),

  /**
   * The Songs page (and Home's Trending row): search, sort (trending = plays in the last
   * 7 days), For sale / Owned / Not owned, price range and Has stems, a page at a time.
   */
  browse: publicProcedure
    .input(
      z.object({
        search: z.string().trim().max(80).optional(),
        sort: z.enum(SONG_SORTS).default("trending"),
        show: z.enum(SONG_OWNERSHIP).default("all"),
        minPrice: z.number().min(0).max(1e12).optional(),
        maxPrice: z.number().min(0).max(1e12).optional(),
        stems: z.boolean().optional(),
        playedThisWeek: z.boolean().optional(),
        cursor: z.number().int().min(0).optional(),
        limit: z.number().int().min(1).max(PAGE_SIZE).default(24),
      }),
    )
    .query(({ ctx, input }) => browseSongs(ctx, ctx.session?.user.id ?? null, input)),

  /** Every song, sortable, a page at a time. */
  tracks: publicProcedure
    .input(
      z.object({
        sort: trackSort,
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(PAGE_SIZE).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const take = input.limit ?? PAGE_SIZE;
      const rows = await ctx.db.item.findMany({
        where: { ...listedItemWhere, type: "TRACK" },
        orderBy: [ORDER[input.sort], { id: "asc" }],
        take: take + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        select: itemCardSelect,
      });
      const hasMore = rows.length > take;
      const page = hasMore ? rows.slice(0, take) : rows;
      return { tracks: page.map(toItemCard), nextCursor: hasMore ? page.at(-1)?.id : undefined };
    }),

  /**
   * Recently played: the last 12 different songs, newest play first, previews included.
   * Signed in: your plays. Guest: the plays this browser made (its listening id) with no account attached.
   */
  recent: publicProcedure
    .input(z.object({ sessionId: z.string().min(8).max(64).optional() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session?.user.id;
      if (!userId && !input.sessionId) return [];
      const latest = await ctx.db.playEvent.groupBy({
        by: ["itemId"],
        where: userId ? { userId } : { sessionId: input.sessionId, userId: null },
        _max: { createdAt: true },
        orderBy: { _max: { createdAt: "desc" } },
        // A few spare, in case some were deleted or unlisted since.
        take: RECENT + 8,
      });
      if (latest.length === 0) return [];
      const rows = await ctx.db.item.findMany({
        where: { ...listedItemWhere, type: "TRACK", id: { in: latest.map((row) => row.itemId) } },
        select: itemCardSelect,
      });
      const byId = new Map(rows.map((row) => [row.id, row]));
      return latest
        .flatMap((row) => {
          const item = byId.get(row.itemId);
          return item ? [toItemCard(item)] : [];
        })
        .slice(0, RECENT);
    }),

  /** On sign-in: this browser's guest plays become yours, so Recently played carries over. */
  claimPlays: authedProcedure
    .input(z.object({ sessionId: z.string().min(8).max(64) }))
    .mutation(async ({ ctx, input }) => {
      const { count } = await ctx.db.playEvent.updateMany({
        where: { sessionId: input.sessionId, userId: null },
        data: { userId: ctx.session.user.id },
      });
      return { claimed: count };
    }),

  /** "Your items": songs you made and songs you own (bought, received, gifted). */
  mine: authedProcedure.input(z.object({ sort: trackSort })).query(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;
    const rows = await ctx.db.item.findMany({
      where: {
        deletedAt: null,
        type: "TRACK",
        OR: [{ createdById: userId }, { ownerships: { some: { userId, quantity: { gt: 0 } } } }],
      },
      orderBy: [ORDER[input.sort], { id: "asc" }],
      take: 500,
      select: { ...itemCardSelect, createdById: true },
    });
    return rows.map((row) => ({
      ...toItemCard(row),
      source: row.createdById === userId ? ("created" as const) : ("owned" as const),
    }));
  }),
});
