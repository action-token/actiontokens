import type { Prisma } from "@actiontokens/db";

import type { ServiceCtx } from "../gifts/claim";
import { itemCardSelect, listedItemWhere, toItemCard } from "./item-card";

export const SONG_SORTS = [
  "trending",
  "popular",
  "newest",
  "title",
  "price_asc",
  "price_desc",
] as const;
export type SongSort = (typeof SONG_SORTS)[number];
export const SONG_OWNERSHIP = ["all", "forSale", "owned", "notOwned"] as const;
export type SongOwnership = (typeof SONG_OWNERSHIP)[number];

export type SongBrowseInput = {
  search?: string;
  sort: SongSort;
  show: SongOwnership;
  /** BANDCOIN, inclusive; either one means "for sale in this range". */
  minPrice?: number;
  maxPrice?: number;
  /** Only songs with stems (ones you can remix). */
  stems?: boolean;
  /** Only songs played in the last 7 days (the Trending row and hero). */
  playedThisWeek?: boolean;
  /** How many to skip: these lists page by position. */
  cursor?: number;
  limit: number;
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/** The rankings done in memory (trending, price) look at this many matching songs at most. */
const RANK_CAP = 5000;

/** The filters as one Prisma where; null when the answer is "nothing" (Owned, signed out). */
export function songWhere(
  viewerId: string | null,
  input: Pick<SongBrowseInput, "search" | "show" | "minPrice" | "maxPrice" | "stems">,
): Prisma.ItemWhereInput | null {
  if (input.show === "owned" && !viewerId) return null;
  const search = input.search?.trim();
  const priced = input.minPrice !== undefined || input.maxPrice !== undefined;
  const and: Prisma.ItemWhereInput[] = [{ ...listedItemWhere, type: "TRACK" }];

  if (search) {
    and.push({
      OR: [
        { title: { contains: search, mode: "insensitive" } },
        { organization: { name: { contains: search, mode: "insensitive" } } },
        { track: { artistName: { contains: search, mode: "insensitive" } } },
      ],
    });
  }
  if (input.show === "forSale" || priced) {
    and.push({
      listings: {
        some: {
          status: "ACTIVE",
          ...(priced
            ? { priceBandcoin: { gte: input.minPrice ?? 0, lte: input.maxPrice ?? undefined } }
            : {}),
        },
      },
    });
  }
  if (viewerId && (input.show === "owned" || input.show === "notOwned")) {
    const mine = { some: { userId: viewerId, quantity: { gt: 0 } } };
    and.push(input.show === "owned" ? { ownerships: mine } : { NOT: { ownerships: mine } });
  }
  if (input.stems) and.push({ stems: { some: {} } });
  return { AND: and };
}

const DB_ORDER = {
  popular: [{ playCount: "desc" }, { createdAt: "desc" }, { id: "asc" }],
  newest: [{ createdAt: "desc" }, { id: "asc" }],
  title: [{ title: "asc" }, { id: "asc" }],
} satisfies Partial<Record<SongSort, Prisma.ItemOrderByWithRelationInput[]>>;

/**
 * Every song, searched and filtered, a page at a time. Trending ranks by plays in
 * the last 7 days, then all-time plays; the price sorts use each song's cheapest open
 * listing (songs not for sale go last). Those two are ranked in memory over the
 * matching songs, so every sort pages by position.
 */
export async function browseSongs(
  ctx: Pick<ServiceCtx, "db">,
  viewerId: string | null,
  input: SongBrowseInput,
  now = new Date(),
) {
  const offset = input.cursor ?? 0;
  const empty = { tracks: [], nextCursor: undefined, total: 0 };
  const where = songWhere(viewerId, input);
  if (!where) return empty;

  const weekAgo = new Date(now.getTime() - WEEK_MS);
  const ranked =
    input.sort === "trending" || input.sort.startsWith("price") || input.playedThisWeek;

  if (!ranked) {
    const order = DB_ORDER[input.sort as keyof typeof DB_ORDER];
    const [rows, total] = await Promise.all([
      ctx.db.item.findMany({
        where,
        orderBy: order,
        skip: offset,
        take: input.limit + 1,
        select: itemCardSelect,
      }),
      ctx.db.item.count({ where }),
    ]);
    const page = rows.slice(0, input.limit);
    return {
      tracks: page.map((row) => ({ ...toItemCard(row), playsThisWeek: null as number | null })),
      nextCursor: rows.length > input.limit ? offset + input.limit : undefined,
      total,
    };
  }

  // Rank in memory: the matching songs' ids with what the order needs.
  const candidates = await ctx.db.item.findMany({
    where,
    select: {
      id: true,
      title: true,
      playCount: true,
      createdAt: true,
      listings: {
        where: { status: "ACTIVE" },
        orderBy: { priceBandcoin: "asc" },
        take: 1,
        select: { priceBandcoin: true },
      },
    },
    take: RANK_CAP,
  });
  const weekly = new Map<string, number>();
  const counted = input.sort === "trending" || Boolean(input.playedThisWeek);
  if (candidates.length > 0 && counted) {
    const counts = await ctx.db.playEvent.groupBy({
      by: ["itemId"],
      where: { createdAt: { gte: weekAgo }, itemId: { in: candidates.map((row) => row.id) } },
      _count: { _all: true },
    });
    for (const row of counts) weekly.set(row.itemId, row._count._all);
  }

  const price = (row: (typeof candidates)[number]) => row.listings[0]?.priceBandcoin.toNumber();
  const byNewest = (a: (typeof candidates)[number], b: (typeof candidates)[number]) =>
    b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id);
  const pool = input.playedThisWeek
    ? candidates.filter((row) => (weekly.get(row.id) ?? 0) > 0)
    : candidates;
  const sorted = [...pool].sort((a, b) => {
    if (input.sort === "price_asc" || input.sort === "price_desc") {
      const pa = price(a);
      const pb = price(b);
      if (pa === undefined || pb === undefined) {
        if (pa !== pb) return pa === undefined ? 1 : -1;
      } else if (pa !== pb) return input.sort === "price_asc" ? pa - pb : pb - pa;
      return byNewest(a, b);
    }
    if (input.sort === "trending") {
      return (
        (weekly.get(b.id) ?? 0) - (weekly.get(a.id) ?? 0) ||
        b.playCount - a.playCount ||
        byNewest(a, b)
      );
    }
    // playedThisWeek with a database sort: apply that sort here.
    if (input.sort === "popular") return b.playCount - a.playCount || byNewest(a, b);
    if (input.sort === "title") return a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
    return byNewest(a, b);
  });

  const ids = sorted.slice(offset, offset + input.limit).map((row) => row.id);
  const rows = ids.length
    ? await ctx.db.item.findMany({ where: { id: { in: ids } }, select: itemCardSelect })
    : [];
  const byId = new Map(rows.map((row) => [row.id, row]));
  return {
    tracks: ids.flatMap((id) => {
      const row = byId.get(id);
      return row
        ? [{ ...toItemCard(row), playsThisWeek: counted ? (weekly.get(id) ?? 0) : null }]
        : [];
    }),
    nextCursor: offset + input.limit < sorted.length ? offset + input.limit : undefined,
    total: sorted.length,
  };
}
