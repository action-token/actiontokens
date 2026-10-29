import { z } from "zod";

import { ItemType, type Prisma } from "@bandcoin/db";

import { itemCardSelect, listedItemWhere, toItemCard } from "../../services/catalog/item-card";
import { createRouter, publicProcedure } from "../../trpc";

const PAGE_SIZE = 24;

const SORTS = {
  newest: [{ createdAt: "desc" }],
  popular: [{ playCount: "desc" }, { createdAt: "desc" }],
  title: [{ title: "asc" }],
} satisfies Record<string, Prisma.ItemOrderByWithRelationInput[]>;

export const catalogRouter = createRouter({
  /** The home page in one request: hero picks, trending, new music, top artists, live bounties. */
  home: publicProcedure.query(async ({ ctx }) => {
    const forSale = {
      ...listedItemWhere,
      listings: { some: { status: "ACTIVE" } },
    } satisfies Prisma.ItemWhereInput;
    const [featured, trending, newMusic, artists, bounties] = await Promise.all([
      ctx.db.item.findMany({
        where: { ...forSale, listings: { some: { status: "ACTIVE", isFeatured: true } } },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { ...itemCardSelect, description: true },
      }),
      ctx.db.item.findMany({
        where: forSale,
        orderBy: SORTS.popular,
        take: 12,
        select: itemCardSelect,
      }),
      ctx.db.item.findMany({
        where: { ...listedItemWhere, type: "TRACK" },
        orderBy: { createdAt: "desc" },
        take: 12,
        select: itemCardSelect,
      }),
      ctx.db.artist.findMany({
        where: { status: "APPROVED" },
        orderBy: { followers: { _count: "desc" } },
        take: 10,
        select: {
          name: true,
          slug: true,
          avatarUrl: true,
          _count: { select: { followers: true, items: true } },
        },
      }),
      ctx.db.bounty.findMany({
        where: { status: "RUNNING", fundTxHash: { not: null } },
        orderBy: { createdAt: "desc" },
        take: 4,
        select: {
          id: true,
          title: true,
          summary: true,
          prizeAmount: true,
          prizeCurrency: true,
          artist: { select: { name: true, slug: true, avatarUrl: true } },
          _count: { select: { participants: true } },
        },
      }),
    ]);
    const hero =
      featured.length > 0
        ? featured
        : await ctx.db.item.findMany({
            where: forSale,
            orderBy: SORTS.popular,
            take: 3,
            select: { ...itemCardSelect, description: true },
          });
    return {
      hero: hero.map((row) => ({ ...toItemCard(row), description: row.description })),
      trending: trending.map(toItemCard),
      newMusic: newMusic.map(toItemCard),
      artists: artists.map((artist) => ({
        name: artist.name,
        slug: artist.slug,
        avatarUrl: artist.avatarUrl,
        followers: artist._count.followers,
        items: artist._count.items,
      })),
      bounties: bounties.map((bounty) => ({
        id: bounty.id,
        title: bounty.title,
        summary: bounty.summary,
        prize: { amount: bounty.prizeAmount.toString(), currency: bounty.prizeCurrency },
        artist: bounty.artist,
        participants: bounty._count.participants,
      })),
    };
  }),

  /** "More from this artist" beside an item page. */
  moreFromArtist: publicProcedure
    .input(z.object({ itemSlug: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const item = await ctx.db.item.findUnique({
        where: { slug: input.itemSlug },
        select: { id: true, artistId: true, artist: { select: { name: true, slug: true } } },
      });
      if (!item?.artistId) return null;
      const rows = await ctx.db.item.findMany({
        where: { ...listedItemWhere, artistId: item.artistId, id: { not: item.id } },
        orderBy: SORTS.popular,
        take: 5,
        select: itemCardSelect,
      });
      return { artist: item.artist, items: rows.map(toItemCard) };
    }),

  /** The marketplace grid: everything for sale, by type, search and sort, a page at a time. */
  browse: publicProcedure
    .input(
      z.object({
        type: z.enum(ItemType).optional(),
        search: z.string().trim().max(80).optional(),
        sort: z.enum(["newest", "popular", "title"]).default("newest"),
        cursor: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const where: Prisma.ItemWhereInput = {
        ...listedItemWhere,
        listings: { some: { status: "ACTIVE" } },
        ...(input.type ? { type: input.type } : {}),
        ...(input.search
          ? {
              OR: [
                { title: { contains: input.search, mode: "insensitive" } },
                { artist: { name: { contains: input.search, mode: "insensitive" } } },
              ],
            }
          : {}),
      };
      const rows = await ctx.db.item.findMany({
        where,
        orderBy: [...SORTS[input.sort], { id: "asc" }],
        take: PAGE_SIZE + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        select: itemCardSelect,
      });
      const hasMore = rows.length > PAGE_SIZE;
      const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
      return { items: page.map(toItemCard), nextCursor: hasMore ? page.at(-1)?.id : undefined };
    }),
});
