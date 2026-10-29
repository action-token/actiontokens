import { Prisma } from "@bandcoin/db";
import { AppError, ErrorCodes } from "@bandcoin/errors";

import type { Context } from "../../context";
import { statusOf } from "./pins";

/**
 * Collection reports: how an artist's pins are collected, by whom and when.
 * Read-only, and always scoped to the signed-in artist's own pins. Counting
 * happens in SQL so long histories stay fast; hidden claims, hidden spots and
 * hidden pins never count.
 */
type ReportCtx = Pick<Context, "db">;
type ArtistRef = { id: string };

/** The most collectors one report lists; the CSV export has them all. */
export const MAX_COLLECTORS = 1000;

const dayOf = Prisma.sql`to_char(c."createdAt", 'YYYY-MM-DD')`;

export async function pinReport(ctx: ReportCtx, artist: ArtistRef, pinId: string, now = new Date()) {
  const pin = await ctx.db.pin.findFirst({
    where: { id: pinId, artistId: artist.id },
    select: {
      id: true,
      title: true,
      description: true,
      imageUrl: true,
      type: true,
      link: true,
      isHidden: true,
      startsAt: true,
      endsAt: true,
      claimLimit: true,
      claimsLeft: true,
      spots: {
        where: { isHidden: false },
        orderBy: { id: "asc" },
        select: { id: true, latitude: true, longitude: true, autoCollect: true, _count: { select: { claims: { where: { isHidden: false } } } } },
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
        user: { select: { id: true, username: true, displayName: true, avatarUrl: true, email: true, walletAddress: true } },
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
      user: { id: user.id, name: user.displayName ?? user.username, image: user.avatarUrl, email: user.email, wallet: user.walletAddress },
    })),
  };
}
