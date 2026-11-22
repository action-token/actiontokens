import { z } from "zod";

import { ItemType, type Prisma } from "@actiontokens/db";

import { publicBountyWhere } from "./bounty";
import { prizeView } from "../../services/bounty/prize";
import { itemCardSelect, listedItemWhere, toItemCard } from "../../services/catalog/item-card";
import { browseSongs } from "../../services/catalog/song-browse";
import type { ServiceCtx } from "../../services/gifts/claim";
import { createRouter, publicProcedure } from "../../trpc";

const PAGE_SIZE = 24;
/** Cards in each Home carousel before it loads more. */
const HOME_ROW = 12;
/** Cards per fetch on a home shelf (drops, bounties, organizations); the row loads the next batch
    as the arrows near its end. */
export const SHELF = 10;

const SORTS = {
  newest: [{ createdAt: "desc" }],
  popular: [{ playCount: "desc" }, { createdAt: "desc" }],
  title: [{ title: "asc" }],
} satisfies Record<string, Prisma.ItemOrderByWithRelationInput[]>;

const forSaleWhere = {
  ...listedItemWhere,
  listings: { some: { status: "ACTIVE", kind: { not: "BUNDLE" } } },
} satisfies Prisma.ItemWhereInput;

/** Takes one extra row to know whether a next page exists. */
const page = <T>(rows: T[]) => ({ items: rows.slice(0, SHELF), hasMore: rows.length > SHELF });

/** Live drops: the newest items on sale, songs and fan tokens aside (they have their own rows). */
async function loadDrops(ctx: ServiceCtx, skip: number) {
  const rows = await ctx.db.item.findMany({
    where: { ...forSaleWhere, type: { notIn: ["TRACK", "FAN_TOKEN"] } },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    skip,
    take: SHELF + 1,
    select: { ...itemCardSelect, saleEndsAt: true },
  });
  const { items, hasMore } = page(rows);
  // copies sold so far (primary sales), for the "sold / supply" edition line
  const soldRows = items.length
    ? await ctx.db.listing.groupBy({
        by: ["itemId"],
        where: { itemId: { in: items.map((drop) => drop.id) }, kind: "PRIMARY" },
        _sum: { quantitySold: true },
      })
    : [];
  const sold = new Map(soldRows.map((row) => [row.itemId, row._sum.quantitySold ?? 0]));
  return {
    hasMore,
    items: items.map((drop) => ({
      ...toItemCard(drop),
      supply: drop.supply,
      sold: sold.get(drop.id) ?? 0,
      saleEndsAt: drop.saleEndsAt,
    })),
  };
}

/** Running public bounties, newest first. */
async function loadBounties(ctx: ServiceCtx, skip: number) {
  const rows = await ctx.db.bounty.findMany({
    where: { ...publicBountyWhere, status: "RUNNING" },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    skip,
    take: SHELF + 1,
    select: {
      id: true,
      title: true,
      summary: true,
      prizeAmount: true,
      prizeCurrency: true,
      prizeAssetCode: true,
      prizeAssetIssuer: true,
      organization: { select: { name: true, slug: true, avatarUrl: true } },
      _count: { select: { participants: true } },
    },
  });
  const { items, hasMore } = page(rows);
  return {
    hasMore,
    items: items.map((bounty) => ({
      id: bounty.id,
      title: bounty.title,
      summary: bounty.summary,
      prize: prizeView(bounty, ctx.chain.config),
      artist: bounty.organization,
      participants: bounty._count.participants,
    })),
  };
}

/** Approved organizations, most followed first, with the viewer's follow and the fan token price. */
async function loadOrgs(ctx: ServiceCtx, viewerId: string | null, skip: number) {
  const rows = await ctx.db.organization.findMany({
    where: { status: "APPROVED" },
    orderBy: [{ followers: { _count: "desc" } }, { createdAt: "asc" }, { id: "asc" }],
    skip,
    take: SHELF + 1,
    select: {
      id: true,
      name: true,
      slug: true,
      avatarUrl: true,
      coverUrl: true,
      // the viewer's own follow, if any (isTemporary false = also a subscriber)
      followers: viewerId ? { where: { userId: viewerId }, select: { isTemporary: true } } : false,
      bio: true,
      _count: { select: { followers: true, items: true } },
      fanTokenItem: {
        select: {
          slug: true,
          classicToken: { select: { code: true } },
          listings: {
            where: { status: "ACTIVE" },
            orderBy: { priceActionToken: "asc" },
            take: 1,
            select: { priceActionToken: true, priceUsd: true },
          },
        },
      },
    },
  });
  const { items, hasMore } = page(rows);
  return {
    hasMore,
    items: items.map((artist) => {
      const token = artist.fanTokenItem;
      const price = token?.listings[0];
      const follow = artist.followers?.[0];
      return {
        id: artist.id,
        following: follow !== undefined,
        subscribed: follow !== undefined && !follow.isTemporary,
        name: artist.name,
        slug: artist.slug,
        avatarUrl: artist.avatarUrl,
        coverUrl: artist.coverUrl,
        bio: artist.bio,
        followers: artist._count.followers,
        items: artist._count.items,
        /** The organization's fan token and its cheapest open price, when it sells one */
        token:
          token?.classicToken?.code != null
            ? {
                code: token.classicToken.code,
                slug: token.slug,
                price: price
                  ? {
                      actionToken: price.priceActionToken.toString(),
                      usd: price.priceUsd.toString(),
                    }
                  : null,
              }
            : null,
      };
    }),
  };
}

export const catalogRouter = createRouter({
  /** The home page in one request: hero picks, trending, new music, top artists, live bounties. */
  home: publicProcedure.query(async ({ ctx }) => {
    const forSale = forSaleWhere;
    const viewerId = ctx.session?.user.id ?? null;
    const [featured, trending, newMusic, orgs, bounties, drops] = await Promise.all([
      ctx.db.item.findMany({
        where: { ...forSale, listings: { some: { status: "ACTIVE", isFeatured: true } } },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { ...itemCardSelect, description: true },
      }),
      // Songs played in the last 7 days; `music.browse` with the same input continues it.
      browseSongs(ctx, ctx.session?.user.id ?? null, {
        sort: "trending",
        show: "all",
        playedThisWeek: true,
        limit: HOME_ROW,
      }),
      ctx.db.item.findMany({
        where: { ...listedItemWhere, type: "TRACK" },
        // Same order as `music.tracks` (newest) so its cursor continues this carousel.
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: HOME_ROW,
        select: itemCardSelect,
      }),
      loadOrgs(ctx, viewerId, 0),
      loadBounties(ctx, 0),
      loadDrops(ctx, 0),
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
      trending: trending.tracks,
      newMusic: newMusic.map(toItemCard),
      /** Where `music.browse` (trending, played this week) / `music.tracks` (newest) pick up when the carousel nears its end. */
      trendingCursor: trending.nextCursor,
      newMusicCursor: newMusic.length === HOME_ROW ? newMusic.at(-1)?.id : undefined,
      artists: orgs.items,
      drops: drops.items,
      bounties: bounties.items,
      /** Whether each shelf has a next page (`catalog.shelf` serves it) */
      more: { artists: orgs.hasMore, drops: drops.hasMore, bounties: bounties.hasMore },
    };
  }),

  /** "More from this artist" beside an item page. */
  /** One batch of a home shelf (10 cards), loaded as the arrows near the end of the row. */
  shelf: publicProcedure
    .input(
      z.object({
        shelf: z.enum(["drops", "bounties", "artists"]),
        page: z.number().int().min(0).max(200),
      }),
    )
    .query(async ({ ctx, input }) => {
      const skip = input.page * SHELF;
      const viewerId = ctx.session?.user.id ?? null;
      if (input.shelf === "drops")
        return { shelf: "drops" as const, ...(await loadDrops(ctx, skip)) };
      if (input.shelf === "bounties")
        return { shelf: "bounties" as const, ...(await loadBounties(ctx, skip)) };
      return { shelf: "artists" as const, ...(await loadOrgs(ctx, viewerId, skip)) };
    }),

  moreFromArtist: publicProcedure
    .input(z.object({ itemSlug: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const item = await ctx.db.item.findUnique({
        where: { slug: input.itemSlug },
        select: {
          id: true,
          organizationId: true,
          organization: { select: { name: true, slug: true } },
        },
      });
      if (!item?.organizationId) return null;
      const rows = await ctx.db.item.findMany({
        where: { ...listedItemWhere, organizationId: item.organizationId, id: { not: item.id } },
        orderBy: SORTS.popular,
        take: 5,
        select: itemCardSelect,
      });
      return { artist: item.organization, items: rows.map(toItemCard) };
    }),

  /** The marketplace grid: everything for sale, by type, search and sort, a page at a time. `locked`: only NFTs with locked content (the old Action Tokens' gated list). */
  browse: publicProcedure
    .input(
      z.object({
        type: z.enum(ItemType).optional(),
        search: z.string().trim().max(80).optional(),
        sort: z.enum(["newest", "popular", "title"]).default("newest"),
        locked: z.boolean().optional(),
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const where: Prisma.ItemWhereInput = {
        ...listedItemWhere,
        listings: { some: { status: "ACTIVE", kind: { not: "BUNDLE" } } },
        ...(input.type ? { type: input.type } : {}),
        ...(input.locked ? { lockedContents: { some: {} } } : {}),
        ...(input.search
          ? {
              OR: [
                { title: { contains: input.search, mode: "insensitive" } },
                { organization: { name: { contains: input.search, mode: "insensitive" } } },
              ],
            }
          : {}),
      };
      const rows = await ctx.db.item.findMany({
        where,
        orderBy: [...SORTS[input.sort], { id: "asc" }],
        take: (input.limit ?? PAGE_SIZE) + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        select: itemCardSelect,
      });
      const take = input.limit ?? PAGE_SIZE;
      const hasMore = rows.length > take;
      const page = hasMore ? rows.slice(0, take) : rows;
      return { items: page.map(toItemCard), nextCursor: hasMore ? page.at(-1)?.id : undefined };
    }),
});
