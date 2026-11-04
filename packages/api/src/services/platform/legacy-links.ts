import type { Context } from "../../context";

/**
 * Old shared links. The production copy kept every old id in `legacy_id_map`,
 * so a link to the old app's page can be sent to the same thing's new page.
 * Returns the new path, or null when the thing wasn't copied or is gone.
 */
type Db = Pick<Context, "db">["db"];

export const LEGACY_KINDS = ["artist", "asset", "market-asset", "nft", "album"] as const;
export type LegacyKind = (typeof LEGACY_KINDS)[number];

/** The old table each kind of link pointed into. */
const OLD_TABLE: Record<LegacyKind, string> = {
  artist: "Creator",
  asset: "Asset",
  "market-asset": "MarketAsset",
  nft: "Nft",
  album: "Album",
};

const MAX_ID = 100;

export async function resolveLegacyLink(
  db: Db,
  kind: string,
  oldId: string,
): Promise<string | null> {
  if (
    !(LEGACY_KINDS as readonly string[]).includes(kind) ||
    oldId.length === 0 ||
    oldId.length > MAX_ID
  )
    return null;
  const mapped = await db.legacyIdMap.findUnique({
    where: {
      legacyTable_legacyId: { legacyTable: OLD_TABLE[kind as LegacyKind], legacyId: oldId },
    },
    select: { newId: true },
  });
  if (!mapped) return null;

  switch (kind as LegacyKind) {
    case "artist": {
      const artist = await db.artist.findUnique({
        where: { id: mapped.newId },
        select: { slug: true },
      });
      return artist ? `/artist/${artist.slug}` : null;
    }
    case "asset":
    case "nft": {
      const item = await db.item.findFirst({
        where: { id: mapped.newId, deletedAt: null },
        select: { slug: true },
      });
      return item ? `/item/${item.slug}` : null;
    }
    case "market-asset": {
      const listing = await db.listing.findUnique({
        where: { id: mapped.newId },
        select: { item: { select: { slug: true, deletedAt: true } } },
      });
      return listing && !listing.item.deletedAt ? `/item/${listing.item.slug}` : null;
    }
    case "album": {
      const album = await db.album.findUnique({
        where: { id: mapped.newId },
        select: { slug: true },
      });
      return album ? `/album/${album.slug}` : null;
    }
  }
}
