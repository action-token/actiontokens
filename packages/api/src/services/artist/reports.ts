import { Prisma } from "@actiontokens/db";
import { AppError, ErrorCodes } from "@actiontokens/errors";

import type { Context } from "../../context";
import { statusOf } from "./pins";
import { notUnlockPin } from "../catalog/unlock-pins";

/**
 * Collection reports: how an artist's pins are collected, by whom and when.
 * Read-only. Scoped to one artist (the signed-in artist's own pins), or to
 * every artist when `artist` is null (admins only, via the admin router).
 * Counting happens in SQL so long histories stay fast; hidden claims, hidden
 * spots and hidden pins never count.
 */
type ReportCtx = Pick<Context, "db">;
type ArtistRef = { id: string } | null;

/** The most pins the all-artists report lists; the numbers above it count every pin. */
export const MAX_REPORT_PINS = 500;

/** The most collectors one report lists; the CSV export has them all. */
export const MAX_COLLECTORS = 1000;

const dayOf = Prisma.sql`to_char(c."createdAt", 'YYYY-MM-DD')`;

export async function pinReport(
  ctx: ReportCtx,
  artist: ArtistRef,
  pinId: string,
  now = new Date(),
) {
  const pin = await ctx.db.pin.findFirst({
    where: { id: pinId, ...(artist ? { artistId: artist.id } : {}) },
    select: {
      artistId: true,
      id: true,
      title: true,
      description: true,
      imageUrl: true,
      type: true,
      link: true,
      approval: true,
      isHidden: true,
      startsAt: true,
      endsAt: true,
      claimLimit: true,
      claimsLeft: true,
      spots: {
        where: { isHidden: false },
        orderBy: { id: "asc" },
        select: {
          id: true,
          latitude: true,
          longitude: true,
          autoCollect: true,
          _count: { select: { claims: { where: { isHidden: false } } } },
        },
      },
    },
  });
  if (!pin) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Pin not found" });

  const [daily, claims] = await Promise.all([
    ctx.db.$queryRaw<{ day: string; n: number }[]>`
      SELECT ${dayOf} AS day, COUNT(*)::int AS n
      FROM pin_claims c JOIN pin_spots s ON s.id = c."spotId"
      WHERE s."pinId" = ${pin.id} AND c."isHidden" = false AND s."isHidden" = false
      GROUP BY 1 ORDER BY 1`,
    ctx.db.pinClaim.findMany({
      where: { isHidden: false, spot: { pinId: pin.id, isHidden: false } },
      orderBy: { createdAt: "desc" },
      take: MAX_COLLECTORS,
      select: {
        id: true,
        createdAt: true,
        claimedAt: true,
        isRedeemed: true,
        redeemedAt: true,
        spotId: true,
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            email: true,
            walletAddress: true,
          },
        },
      },
    }),
  ]);

  const { spots, isHidden: _hidden, ...rest } = pin;
  return {
    ...rest,
    status: statusOf(pin, now),
    spots: spots.map(({ _count, ...spot }) => ({ ...spot, collected: _count.claims })),
    daily,
    collectors: claims.map(({ user, ...claim }) => ({
      ...claim,
      user: {
        id: user.id,
        name: user.displayName ?? user.username,
        image: user.avatarUrl,
        email: user.email,
        wallet: user.walletAddress,
      },
    })),
  };
}

export type ReportPeriod = { from?: Date; to?: Date };

/** Claims of the artist's live (not hidden) pins in a period. */
const claimsFrom = Prisma.sql`pin_claims c JOIN pin_spots s ON s.id = c."spotId" JOIN pins p ON p.id = s."pinId"`;
function claimsWhere(artist: ArtistRef, { from, to }: ReportPeriod, pinId?: string) {
  return Prisma.sql`c."isHidden" = false AND s."isHidden" = false AND p."isHidden" = false
    ${artist ? Prisma.sql`AND p."artistId" = ${artist.id}` : Prisma.empty}
    ${from ? Prisma.sql`AND c."createdAt" >= ${from}` : Prisma.empty}
    ${to ? Prisma.sql`AND c."createdAt" <= ${to}` : Prisma.empty}
    ${pinId ? Prisma.sql`AND p.id = ${pinId}` : Prisma.empty}`;
}

export type CollectionTotals = { collections: number; collectors: number; redeemed: number };

async function totals(
  ctx: ReportCtx,
  artist: ArtistRef,
  period: ReportPeriod,
): Promise<CollectionTotals> {
  const [row] = await ctx.db.$queryRaw<CollectionTotals[]>`
    SELECT COUNT(*)::int AS collections, COUNT(DISTINCT c."userId")::int AS collectors,
           COUNT(*) FILTER (WHERE c."isRedeemed")::int AS redeemed
    FROM ${claimsFrom} WHERE ${claimsWhere(artist, period)}`;
  return row ?? { collections: 0, collectors: 0, redeemed: 0 };
}

/** The window of the same length right before this one, for "vs previous period". */
export function previousPeriod({ from, to }: ReportPeriod, now = new Date()): ReportPeriod | null {
  if (!from) return null;
  const length = (to ?? now).getTime() - from.getTime();
  return { from: new Date(from.getTime() - length), to: new Date(from.getTime() - 1) };
}

/** Totals (with the previous period), collections per day, every pin's numbers, and the top collectors. */
export async function collectionSummary(
  ctx: ReportCtx,
  artist: ArtistRef,
  period: ReportPeriod,
  now = new Date(),
) {
  const where = claimsWhere(artist, period);
  const previous = previousPeriod(period, now);

  const [current, before, daily, perPin, collectors, pins] = await Promise.all([
    totals(ctx, artist, period),
    previous ? totals(ctx, artist, previous) : Promise.resolve(null),
    ctx.db.$queryRaw<{ day: string; n: number }[]>`
      SELECT ${dayOf} AS day, COUNT(*)::int AS n FROM ${claimsFrom} WHERE ${where} GROUP BY 1 ORDER BY 1`,
    ctx.db.$queryRaw<{ pinId: string; n: number; users: number; last: Date }[]>`
      SELECT p.id AS "pinId", COUNT(*)::int AS n, COUNT(DISTINCT c."userId")::int AS users, MAX(c."createdAt") AS last
      FROM ${claimsFrom} WHERE ${where} GROUP BY p.id`,
    ctx.db.$queryRaw<
      { id: string; name: string | null; image: string | null; wallet: string | null; n: number }[]
    >`
      SELECT u.id, COALESCE(u."displayName", u.username) AS name, u."avatarUrl" AS image, u."walletAddress" AS wallet, COUNT(*)::int AS n
      FROM ${claimsFrom} JOIN users u ON u.id = c."userId"
      WHERE ${where} GROUP BY u.id ORDER BY n DESC, MAX(c."createdAt") DESC LIMIT 10`,
    ctx.db.pin.findMany({
      where: { ...(artist ? { artistId: artist.id } : {}), isHidden: false, ...notUnlockPin },
      orderBy: { createdAt: "desc" },
      ...(artist ? {} : { take: MAX_REPORT_PINS }),
      select: {
        artist: { select: { id: true, name: true } },
        id: true,
        title: true,
        imageUrl: true,
        approval: true,
        isHidden: true,
        startsAt: true,
        endsAt: true,
        claimLimit: true,
        claimsLeft: true,
        createdAt: true,
        _count: { select: { spots: { where: { isHidden: false } } } },
      },
    }),
  ]);

  const byPin = new Map(perPin.map((row) => [row.pinId, row]));
  return {
    totals: current,
    previous: before,
    daily,
    collectors,
    pins: pins.map(({ _count, ...pin }) => {
      const stats = byPin.get(pin.id);
      return {
        ...pin,
        status: statusOf(pin, now),
        spots: _count.spots,
        collected: stats?.n ?? 0,
        collectors: stats?.users ?? 0,
        lastCollected: stats?.last ?? null,
      };
    }),
  };
}

/** The most rows one CSV export holds. */
export const MAX_EXPORT_ROWS = 50_000;

/** Every collection in the period (or of one pin), one row each, for a CSV download. */
export async function exportCollections(
  ctx: ReportCtx,
  artist: ArtistRef,
  period: ReportPeriod,
  pinId?: string,
) {
  return ctx.db.$queryRaw<
    {
      artist: string;
      pin: string;
      pinId: string;
      lat: number;
      lng: number;
      wallet: string | null;
      name: string | null;
      email: string | null;
      collectedAt: Date;
      redeemed: boolean;
    }[]
  >`
    SELECT a.name AS artist, p.title AS pin, p.id AS "pinId", s.latitude AS lat, s.longitude AS lng,
           u."walletAddress" AS wallet, COALESCE(u."displayName", u.username) AS name, u.email,
           c."createdAt" AS "collectedAt", c."isRedeemed" AS redeemed
    FROM ${claimsFrom} JOIN users u ON u.id = c."userId" JOIN artists a ON a.id = p."artistId"
    WHERE ${claimsWhere(artist, period, pinId)}
    ORDER BY c."createdAt" DESC LIMIT ${MAX_EXPORT_ROWS}`;
}
