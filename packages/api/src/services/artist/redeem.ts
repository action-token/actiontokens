import { Prisma } from "@actiontokens/db";

import type { Context } from "../../context";
import { invalid } from "./items";
import { findContentCode, redeemContentCode } from "../catalog/content-codes";
import { notUnlockPin } from "../catalog/unlock-pins";

/**
 * Redeem: a fan shows the 6-character code they got when they collected a
 * pin; the artist checks it and hands over the reward (a signed poster, a
 * ticket, merch). Only the artist who owns the pin can see or redeem its
 * codes, and a code for someone else's pin looks exactly like a wrong code.
 *
 * Redeeming is separate from "claim to wallet" (the digital reward); a pin can
 * have both.
 *
 * The same page takes the door codes of NFT locked content
 * (catalog/content-codes): those are refused until the piece is unlocked.
 */
type ServiceCtx = Pick<Context, "db" | "activity">;
type ArtistRef = { id: string; userId?: string };

export const REDEEM_CODE_LENGTH = 6;
export const MAX_FANS_PER_REWARD = 100;

const fan = {
  select: { id: true, username: true, displayName: true, avatarUrl: true, email: true },
} as const;
const found = {
  id: true,
  isRedeemed: true,
  redeemedAt: true,
  claimedAt: true,
  createdAt: true,
  redeemCode: true,
  user: fan,
  spot: {
    select: {
      latitude: true,
      longitude: true,
      pin: { select: { id: true, title: true, imageUrl: true, type: true } },
    },
  },
} satisfies Prisma.PinClaimSelect;
type FoundClaim = Prisma.PinClaimGetPayload<{ select: typeof found }>;

export function normalizeCode(code: string) {
  const clean = code.trim().toUpperCase();
  if (!new RegExp(`^[A-Z0-9]{${REDEEM_CODE_LENGTH}}$`).test(clean))
    throw invalid(`A redeem code is ${REDEEM_CODE_LENGTH} letters and numbers.`);
  return clean;
}

type Described = Omit<ReturnType<typeof describeClaim>, "latitude" | "longitude"> & {
  latitude: number | null;
  longitude: number | null;
};

const fanOf = (user: FoundClaim["user"]) => ({
  id: user.id,
  name: user.displayName ?? user.username,
  image: user.avatarUrl,
  email: user.email,
});

function describeClaim(claim: FoundClaim) {
  return {
    id: claim.id,
    code: claim.redeemCode,
    redeemedAt: claim.redeemedAt,
    collectedAt: claim.claimedAt ?? claim.createdAt,
    fan: fanOf(claim.user),
    pin: {
      id: claim.spot.pin.id,
      title: claim.spot.pin.title,
      imageUrl: claim.spot.pin.imageUrl,
      type: claim.spot.pin.type,
    },
    latitude: claim.spot.latitude,
    longitude: claim.spot.longitude,
  };
}

const ownClaim = (artist: ArtistRef, code: string) => ({
  redeemCode: code,
  isHidden: false,
  spot: { pin: { organizationId: artist.id } },
});

export type LookupResult =
  | { status: "not_found" }
  /** "locked": an NFT content code whose piece isn't unlocked yet */
  | { status: "pending"; claim: Described }
  | { status: "already_redeemed"; claim: Described }
  | { status: "locked"; claim: Described };

/** Looks a code up without changing anything, so the artist can check the fan and reward first. */
export async function lookupCode(
  ctx: Pick<ServiceCtx, "db">,
  artist: ArtistRef,
  code: string,
): Promise<LookupResult> {
  const clean = normalizeCode(code);
  const claim = await ctx.db.pinClaim.findFirst({ where: ownClaim(artist, clean), select: found });
  if (claim)
    return {
      status: claim.isRedeemed ? "already_redeemed" : "pending",
      claim: describeClaim(claim),
    };
  const content = await findContentCode(ctx.db, artist.id, clean);
  if (!content) return { status: "not_found" };
  return {
    status: content.claim.redeemedAt ? "already_redeemed" : content.unlocked ? "pending" : "locked",
    claim: content.claim,
  };
}

export type RedeemResult =
  | { status: "not_found" }
  | { status: "success"; claim: Described }
  | { status: "already_redeemed"; claim: Described }
  | { status: "locked"; claim: Described };

/** Marks a code redeemed. The update only matches a code nobody redeemed yet, so two people racing can't both succeed. */
export async function redeemCode(
  ctx: ServiceCtx,
  artist: ArtistRef,
  code: string,
): Promise<RedeemResult> {
  const clean = normalizeCode(code);
  const claim = await ctx.db.pinClaim.findFirst({ where: ownClaim(artist, clean), select: found });
  if (!claim) return redeemContent(ctx, artist, clean);
  ctx.activity.set({ targetType: "PinClaim", targetId: claim.id });
  if (claim.isRedeemed) return { status: "already_redeemed", claim: describeClaim(claim) };

  const redeemedAt = new Date();
  const { count } = await ctx.db.pinClaim.updateMany({
    where: { id: claim.id, isRedeemed: false },
    data: { isRedeemed: true, redeemedAt },
  });
  if (count === 0) {
    const current = await ctx.db.pinClaim.findFirst({ where: { id: claim.id }, select: found });
    return { status: "already_redeemed", claim: describeClaim(current ?? claim) };
  }
  return { status: "success", claim: describeClaim({ ...claim, isRedeemed: true, redeemedAt }) };
}

/** An NFT content code: redeemed only once its piece is unlocked, and only once. */
async function redeemContent(
  ctx: ServiceCtx,
  artist: ArtistRef,
  code: string,
): Promise<RedeemResult> {
  const content = await findContentCode(ctx.db, artist.id, code);
  if (!content) return { status: "not_found" };
  ctx.activity.set({ targetType: "LockedContentRedeem", targetId: code });
  if (content.claim.redeemedAt) return { status: "already_redeemed", claim: content.claim };
  if (!content.unlocked) return { status: "locked", claim: content.claim };
  const redeemedAt = await redeemContentCode(ctx.db, code, artist.userId ?? null);
  if (!redeemedAt) {
    const current = await findContentCode(ctx.db, artist.id, code);
    return { status: "already_redeemed", claim: current?.claim ?? content.claim };
  }
  return { status: "success", claim: { ...content.claim, redeemedAt } };
}

/** Rewards, waiting and redeemed across all the artist's live pins. */
export async function redeemSummary(ctx: Pick<ServiceCtx, "db">, artist: ArtistRef) {
  const claims = { isHidden: false, spot: { pin: { organizationId: artist.id, isHidden: false } } };
  const [rewards, collected, redeemed] = await Promise.all([
    ctx.db.pin.count({ where: { organizationId: artist.id, isHidden: false, ...notUnlockPin } }),
    ctx.db.pinClaim.count({ where: claims }),
    ctx.db.pinClaim.count({ where: { ...claims, isRedeemed: true } }),
  ]);
  return { rewards, redeemed, waiting: collected - redeemed };
}

export type ListInput = { search?: string; cursor?: string; limit?: number };
const pageSize = (limit?: number) => Math.min(Math.max(limit ?? 10, 1), 50);

/** Each pin with how many fans collected and redeemed it, and the latest fans (with their codes' state). */
export async function listRewards(
  ctx: Pick<ServiceCtx, "db">,
  artist: ArtistRef,
  input: ListInput,
) {
  const limit = pageSize(input.limit);
  const search = input.search?.trim();
  const where: Prisma.PinWhereInput = {
    organizationId: artist.id,
    isHidden: false,
    ...notUnlockPin,
    ...(search ? { title: { contains: search, mode: "insensitive" } } : {}),
  };
  const [total, pins] = await Promise.all([
    ctx.db.pin.count({ where }),
    ctx.db.pin.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        title: true,
        imageUrl: true,
        type: true,
        startsAt: true,
        endsAt: true,
        claimLimit: true,
        spots: { where: { isHidden: false }, select: { id: true } },
      },
    }),
  ]);
  const nextCursor = pins.length > limit ? pins[limit - 1]?.id : undefined;
  const page = pins.slice(0, limit);

  const ids = page.map((pin) => pin.id);
  const counts = ids.length
    ? await ctx.db.$queryRaw<{ pinId: string; collected: number; redeemed: number }[]>`
        SELECT s."pinId", COUNT(*)::int AS collected, COUNT(*) FILTER (WHERE c."isRedeemed")::int AS redeemed
        FROM pin_claims c JOIN pin_spots s ON s.id = c."spotId"
        WHERE s."pinId" IN (${Prisma.join(ids)}) AND c."isHidden" = false GROUP BY s."pinId"`
    : [];
  const byPin = new Map(counts.map((row) => [row.pinId, row]));
  const fans = await Promise.all(
    page.map((pin) =>
      ctx.db.pinClaim.findMany({
        where: { isHidden: false, spot: { pinId: pin.id } },
        orderBy: { createdAt: "desc" },
        take: MAX_FANS_PER_REWARD,
        select: {
          id: true,
          isRedeemed: true,
          redeemedAt: true,
          claimedAt: true,
          createdAt: true,
          user: fan,
        },
      }),
    ),
  );

  return {
    total,
    nextCursor,
    items: page.map((pin, i) => {
      const stats = byPin.get(pin.id);
      return {
        id: pin.id,
        title: pin.title,
        imageUrl: pin.imageUrl,
        type: pin.type,
        startsAt: pin.startsAt,
        endsAt: pin.endsAt,
        claimLimit: pin.claimLimit,
        spots: pin.spots.length,
        collected: stats?.collected ?? 0,
        redeemed: stats?.redeemed ?? 0,
        fans: (fans[i] ?? []).map((claim) => ({
          id: claim.id,
          isRedeemed: claim.isRedeemed,
          redeemedAt: claim.redeemedAt,
          collectedAt: claim.claimedAt ?? claim.createdAt,
          fan: fanOf(claim.user),
        })),
      };
    }),
  };
}

/** Everything the artist has redeemed, newest first. */
export async function redeemHistory(
  ctx: Pick<ServiceCtx, "db">,
  artist: ArtistRef,
  input: ListInput,
) {
  const limit = pageSize(input.limit ?? 20);
  const search = input.search?.trim();
  const text = (field: string) => ({ [field]: { contains: search, mode: "insensitive" as const } });
  const where: Prisma.PinClaimWhereInput = {
    isRedeemed: true,
    isHidden: false,
    spot: { pin: { organizationId: artist.id, isHidden: false } },
    ...(search
      ? {
          OR: [
            text("redeemCode"),
            { user: { OR: [text("displayName"), text("username"), text("email")] } },
            { spot: { pin: text("title") } },
          ],
        }
      : {}),
  };
  const [total, rows] = await Promise.all([
    ctx.db.pinClaim.count({ where }),
    ctx.db.pinClaim.findMany({
      where,
      orderBy: [{ redeemedAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      select: found,
    }),
  ]);
  const nextCursor = rows.length > limit ? rows[limit - 1]?.id : undefined;
  return { total, nextCursor, items: rows.slice(0, limit).map(describeClaim) };
}
