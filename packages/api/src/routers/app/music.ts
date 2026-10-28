import { z } from "zod";

import type { Prisma } from "@bandcoin/db";

import { itemCardSelect, listedItemWhere, toItemCard } from "../../services/catalog/item-card";
import { authedProcedure, createRouter, publicProcedure } from "../../trpc";

const PAGE_SIZE = 50;
const trackSort = z.enum(["newest", "popular", "title"]).default("newest");
const ORDER = {
  newest: { createdAt: "desc" },
  popular: { playCount: "desc" },
  title: { title: "asc" },
} satisfies Record<z.infer<typeof trackSort>, Prisma.ItemOrderByWithRelationInput>;

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
        orderBy: { createdAt: "desc" },
        take: 12,
        select: { title: true, slug: true, coverUrl: true, artist: { select: { name: true, slug: true } }, _count: { select: { tracks: true } } },
      }),
    ]);
    return {
      newest: newest.map(toItemCard),
      albums: albums.map((album) => ({ ...album, trackCount: album._count.tracks })),
    };
  }),

  /** Every song, sortable, a page at a time. */
  tracks: publicProcedure
    .input(z.object({ sort: trackSort, cursor: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.item.findMany({
        where: { ...listedItemWhere, type: "TRACK" },
        orderBy: [ORDER[input.sort], { id: "asc" }],
        take: PAGE_SIZE + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        select: itemCardSelect,
      });
      const hasMore = rows.length > PAGE_SIZE;
      const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
      return { tracks: page.map(toItemCard), nextCursor: hasMore ? page.at(-1)?.id : undefined };
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
    return rows.map((row) => ({ ...toItemCard(row), source: row.createdById === userId ? ("created" as const) : ("owned" as const) }));
  }),
});
