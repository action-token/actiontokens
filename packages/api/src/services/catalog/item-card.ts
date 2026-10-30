import type { Prisma } from "@bandcoin/db";

/**
 * What a card in any grid or carousel shows: cover, title, artist, type, the
 * cheapest open price, and whether it can be played. One select and one
 * mapper so every list returns the same shape.
 */
export const itemCardSelect = {
  id: true,
  slug: true,
  title: true,
  type: true,
  coverUrl: true,
  supply: true,
  playCount: true,
  createdAt: true,
  artist: { select: { name: true, slug: true } },
  track: { select: { artistName: true } },
  media: { select: { mediaType: true, durationSec: true } },
  listings: {
    where: { status: "ACTIVE" },
    orderBy: { priceBandcoin: "asc" },
    take: 1,
    select: { priceBandcoin: true, priceUsd: true },
  },
} satisfies Prisma.ItemSelect;

type ItemCardRow = Prisma.ItemGetPayload<{ select: typeof itemCardSelect }>;

export function toItemCard(row: ItemCardRow) {
  const price = row.listings[0];
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    type: row.type,
    coverUrl: row.coverUrl,
    artistName: row.artist?.name ?? row.track?.artistName ?? "Bandcoin",
    artistSlug: row.artist?.slug ?? null,
    playable: row.media?.mediaType === "AUDIO",
    durationSec: row.media?.durationSec ?? null,
    playCount: row.playCount,
    price: price
      ? { bandcoin: price.priceBandcoin.toString(), usd: price.priceUsd.toString() }
      : null,
  };
}

export type ItemCard = ReturnType<typeof toItemCard>;

/** Items anyone may see in lists: published, not deleted, not hidden by an admin. */
export const listedItemWhere = {
  deletedAt: null,
  hiddenAt: null,
  visibility: { not: "DRAFT" },
} satisfies Prisma.ItemWhereInput;
