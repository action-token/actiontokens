import tzLookup from "@photostructure/tz-lookup";

import type { MuralCard } from "@bandcoin/ar-core/murals/constants";
import type { Db, Mural, MuralSettings, Prisma } from "@bandcoin/db";

/**
 * Murals: street art fans find and scan for Mural Coins. These are the
 * pieces the read endpoints share; scanning comes with the AR extras.
 */

/** The single settings row, created with the schema defaults on first use. */
export function getMuralSettings(db: Db | Prisma.TransactionClient): Promise<MuralSettings> {
  return db.muralSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
}

export function toMuralCard(mural: Mural, settings: Pick<MuralSettings, "confirmationsNeeded">): MuralCard {
  return {
    id: mural.id,
    title: mural.title ?? mural.autoTitle,
    autoTitled: !mural.title,
    artist: mural.artistName,
    coverUrl: mural.coverUrl,
    latitude: mural.latitude,
    longitude: mural.longitude,
    status: mural.status,
    distinctScanners: mural.distinctScanners,
    confirmationsNeeded: settings.confirmationsNeeded,
    scanCount: mural.scanCount,
  };
}

/** Murals that may be shown: never rejected or merged into another. */
export const LIVE_MURAL = { status: { not: "REJECTED" }, mergedIntoId: null } satisfies Prisma.MuralWhereInput;

/**
 * The time zone at a place. The daily scan limit resets at local midnight
 * where the mural is, so changing the phone's zone buys nothing.
 */
export function timeZoneAt(lat: number, lng: number): string {
  try {
    return tzLookup(lat, lng);
  } catch {
    return "UTC";
  }
}

/** YYYY-MM-DD for `at` in `timeZone`. */
export function localDay(timeZone: string, at = new Date()): string {
  // en-CA formats as an ISO date
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/** Today's scans per mural for one viewer, each mural counted in its own zone. */
export async function scansToday(db: Db, userId: string | undefined, murals: Pick<Mural, "id" | "latitude" | "longitude">[]) {
  const counts = new Map<string, number>();
  if (!userId || murals.length === 0) return counts;
  const scans = await db.muralScan.findMany({
    where: { userId, muralId: { in: murals.map((mural) => mural.id) }, createdAt: { gte: new Date(Date.now() - 36 * 3_600_000) } },
    select: { muralId: true, localDay: true },
  });
  for (const mural of murals) {
    const day = localDay(timeZoneAt(mural.latitude, mural.longitude));
    counts.set(mural.id, scans.filter((scan) => scan.muralId === mural.id && scan.localDay === day).length);
  }
  return counts;
}
