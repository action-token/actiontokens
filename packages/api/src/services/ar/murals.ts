import tzLookup from "@photostructure/tz-lookup";

import type { MuralCard } from "@bandcoin/ar-core/murals/constants";
import type { CoinReason, Db, Mural, MuralSettings, Prisma } from "@bandcoin/db";

/**
 * Murals: street art fans find and scan for Mural Coins. Pieces the read
 * endpoints and the scan pipeline share.
 */

/** The single settings row, created with the schema defaults on first use. */
export function getMuralSettings(db: Db | Prisma.TransactionClient): Promise<MuralSettings> {
  return db.muralSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
}

export function toMuralCard(
  mural: Mural,
  settings: Pick<MuralSettings, "confirmationsNeeded">,
): MuralCard {
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
export const LIVE_MURAL = {
  status: { not: "REJECTED" },
  mergedIntoId: null,
} satisfies Prisma.MuralWhereInput;

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
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/** Today's scans per mural for one viewer, each mural counted in its own zone. */
export async function scansToday(
  db: Db,
  userId: string | undefined,
  murals: Pick<Mural, "id" | "latitude" | "longitude">[],
) {
  const counts = new Map<string, number>();
  if (!userId || murals.length === 0) return counts;
  const scans = await db.muralScan.findMany({
    where: {
      userId,
      muralId: { in: murals.map((mural) => mural.id) },
      createdAt: { gte: new Date(Date.now() - 36 * 3_600_000) },
    },
    select: { muralId: true, localDay: true },
  });
  for (const mural of murals) {
    const day = localDay(timeZoneAt(mural.latitude, mural.longitude));
    counts.set(
      mural.id,
      scans.filter((scan) => scan.muralId === mural.id && scan.localDay === day).length,
    );
  }
  return counts;
}

/** Rough lat/lng box around a point, an indexed pre-filter before the exact distance. */
export function boxAround(lat: number, lng: number, radiusM: number) {
  const dLat = radiusM / 111_320;
  const dLng = radiusM / (111_320 * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));
  return {
    latitude: { gte: lat - dLat, lte: lat + dLat },
    longitude: { gte: lng - dLng, lte: lng + dLng },
  };
}

/** Adds a ledger row and moves the cached balance in the same transaction. Returns the new balance. */
export async function creditCoins(
  tx: Prisma.TransactionClient,
  entry: {
    userId: string;
    amount: number;
    reason: CoinReason;
    muralId?: string;
    scanId?: string;
    note?: string;
  },
): Promise<number> {
  await tx.coinLedgerEntry.create({ data: entry });
  const { balance } = await tx.coinBalance.upsert({
    where: { userId: entry.userId },
    update: { balance: { increment: entry.amount } },
    create: { userId: entry.userId, balance: entry.amount },
  });
  return balance;
}

type GeocodeFeature = {
  properties?: {
    name?: string;
    feature_type?: string;
    context?: {
      street?: { name?: string };
      neighborhood?: { name?: string };
      place?: { name?: string };
    };
  };
};

/**
 * "Mural on Bedford Ave" from Mapbox reverse geocoding, else the
 * neighbourhood or city, else "Street art". Never throws: a missing name
 * must not fail a scan.
 */
export async function autoTitleFor(lat: number, lng: number): Promise<string> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_API;
  if (!token) return "Street art";
  try {
    const url = new URL("https://api.mapbox.com/search/geocode/v6/reverse");
    url.search = new URLSearchParams({
      longitude: String(lng),
      latitude: String(lat),
      types: "address,street,neighborhood,place",
      limit: "1",
      access_token: token,
    }).toString();
    const res = await fetch(url, { signal: AbortSignal.timeout(2_500) });
    if (!res.ok) return "Street art";
    const { features } = (await res.json()) as { features?: GeocodeFeature[] };
    const p = features?.[0]?.properties;
    const street = p?.context?.street?.name ?? (p?.feature_type === "street" ? p.name : undefined);
    if (street) return `Mural on ${street}`;
    const area = p?.context?.neighborhood?.name ?? p?.context?.place?.name;
    return area ? `Mural in ${area}` : "Street art";
  } catch {
    return "Street art";
  }
}
