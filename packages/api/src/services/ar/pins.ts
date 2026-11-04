import type { Horizon } from "@stellar/stellar-sdk";

import { deriveRarity } from "@bandcoin/ar-core/ar/rarity";
import type { ArPin } from "@bandcoin/ar-core/ar/types";
import { site } from "@bandcoin/ar-core/site";
import type { Db, Prisma } from "@bandcoin/db";
import { AppError, ErrorCodes } from "@bandcoin/errors";
import { generateRedeemCode } from "@bandcoin/utils/redeem-code";

import type { Context } from "../../context";
import { tokenTrusted } from "../catalog/access";

/**
 * Pins as the AR app sees them. A `Pin` is one drop; its `PinSpot`s are the
 * places on the map; a `PinClaim` is one fan collecting one spot. Every
 * screen works in spots, so each spot becomes one `ArPin`.
 *
 * `isMultiSpot` decides what a claim covers: each spot separately, or (the
 * default) the whole pin, so collecting any spot collects all of them.
 */

/** Slack on the geofence: honest GPS on the boundary still passes. */
export const GEOFENCE_SLACK_M = 40;

const claimSelect = {
  userId: true,
  redeemCode: true,
  isRedeemed: true,
  claimedAt: true,
  createdAt: true,
} as const;

/** The query shape every pin read uses; claims are only ever the viewer's own. */
export const pinInclude = (viewerId: string | null) =>
  ({
    tier: { select: { requiredTokens: true } },
    artist: {
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        tiers: { where: { isActive: true }, select: { requiredTokens: true } },
        fanTokenItem: { select: { classicToken: { select: { code: true, issuer: true } } } },
      },
    },
    tags: { select: { tag: { select: { label: true } } } },
    spots: {
      where: { isHidden: false },
      include: { claims: { where: { userId: viewerId ?? "" }, select: claimSelect } },
    },
  }) satisfies Prisma.PinInclude;

export type PinRow = Prisma.PinGetPayload<{ include: ReturnType<typeof pinInclude> }>;
type ClaimFacts = Prisma.PinClaimGetPayload<{ select: typeof claimSelect }>;
type SpotFacts = { id: string; latitude: number; longitude: number; autoCollect: boolean };

/** Approved, visible, started and not ended; `now` per request, never at module load. */
export const livePinWhere = (viewerId: string | null, now = new Date()) =>
  ({
    approval: "APPROVED",
    isHidden: false,
    visibility: { not: "DRAFT" },
    startsAt: { lte: now },
    endsAt: { gte: now },
    OR: [{ restrictedToUserId: null }, ...(viewerId ? [{ restrictedToUserId: viewerId }] : [])],
  }) satisfies Prisma.PinWhereInput;

/** What a viewer brings to the lock check: who they follow and their Stellar balances. */
export type Viewer = {
  id: string;
  followedArtistIds: Set<string>;
  account: Horizon.AccountResponse | null;
} | null;

/**
 * Loads what `lockReasonFor` needs. The Horizon read only happens when a
 * member or tier pin is actually among `pins`.
 */
export async function loadViewer(
  ctx: Pick<Context, "db" | "chain" | "session">,
  pins: Pick<PinRow, "visibility">[],
): Promise<Viewer> {
  const user = ctx.session?.user;
  if (!user) return null;
  const needsBalance = pins.some(
    (pin) =>
      pin.visibility === "MEMBERS" ||
      pin.visibility === "TIER" ||
      pin.visibility === "SUBSCRIBERS",
  );
  const [follows, account] = await Promise.all([
    ctx.db.follow.findMany({ where: { userId: user.id }, select: { artistId: true } }),
    needsBalance
      ? ctx.chain.loadAccount(user.walletAddress).catch(() => null)
      : Promise.resolve(null),
  ]);
  return { id: user.id, followedArtistIds: new Set(follows.map((row) => row.artistId)), account };
}

const tokenBalance = (
  account: Horizon.AccountResponse | null,
  token: { code: string; issuer: string },
) => {
  const line = account?.balances.find(
    (balance) =>
      "asset_code" in balance &&
      balance.asset_code === token.code &&
      balance.asset_issuer === token.issuer,
  );
  return line ? Number(line.balance) : 0;
};

/**
 * Why the viewer can't collect this pin, phrased as what unlocks it, or null.
 * Every pin is shown to everyone; this only decides whether it can be taken.
 */
export function lockReasonFor(
  pin: Pick<PinRow, "visibility" | "artistId" | "tier" | "artist">,
  viewer: Viewer,
): string | null {
  const artist = pin.artist.name;
  switch (pin.visibility) {
    case "PUBLIC":
      return null;
    case "SUBSCRIBERS": {
      const token = pin.artist.fanTokenItem?.classicToken;
      if (!token) return "Not available";
      if (!viewer) return `Sign in and subscribe to ${artist} to unlock`;
      return tokenTrusted(viewer.account, token) ? null : `Subscribe to ${artist} to unlock`;
    }
    case "FOLLOWERS":
      if (!viewer) return `Sign in and follow ${artist} to unlock`;
      return viewer.followedArtistIds.has(pin.artistId) ? null : `Follow ${artist} to unlock`;
    case "MEMBERS":
    case "TIER": {
      const token = pin.artist.fanTokenItem?.classicToken;
      const ladder = pin.artist.tiers.map((tier) => Number(tier.requiredTokens));
      const needed =
        pin.visibility === "TIER"
          ? pin.tier
            ? Number(pin.tier.requiredTokens)
            : null
          : Math.min(...ladder);
      // Set up wrong by the artist: nobody can clear it, so don't suggest the viewer could.
      if (!token || needed == null || !Number.isFinite(needed)) return "Not available";
      const amount = `${needed.toLocaleString()} ${token.code}`;
      if (!viewer?.account) return `Sign in holding ${amount} to unlock`;
      return tokenBalance(viewer.account, token) >= needed ? null : `Hold ${amount} to unlock`;
    }
    default:
      return "Not available";
  }
}

/** Facts shared by every spot of one pin, worked out once. */
function pinFacts(pin: PinRow) {
  return {
    rarity: deriveRarity({
      visibility: pin.visibility,
      tierTokens: pin.tier ? Number(pin.tier.requiredTokens) : null,
      artistTierTokens: pin.artist.tiers.map((tier) => Number(tier.requiredTokens)),
    }),
    supply: pin.claimLimit > 0 ? pin.claimLimit : null,
    image: pin.imageUrl ?? pin.artist.avatarUrl ?? site.assets.mark,
    // The same tag can arrive through two links; sorted so a pin reads the same every time.
    tags: [...new Set(pin.tags.map((link) => link.tag.label))].sort(),
  };
}

/** One spot as the app uses it. */
export function toArPin(
  pin: PinRow,
  spot: SpotFacts,
  claim: ClaimFacts | undefined,
  lockReason: string | null,
): ArPin {
  const facts = pinFacts(pin);
  return {
    id: spot.id,
    type: pin.type,
    lat: spot.latitude,
    lng: spot.longitude,
    title: pin.title,
    description: pin.description ?? "",
    imageUrl: facts.image,
    link: pin.link,
    artistId: pin.artistId,
    artistName: pin.artist.name,
    artistImageUrl: pin.artist.avatarUrl ?? site.assets.mark,
    remaining: facts.supply === null ? null : pin.claimsLeft,
    supply: facts.supply,
    rarity: facts.rarity,
    autoCollect: spot.autoCollect,
    detection: "gps",
    endsAt: pin.endsAt.toISOString(),
    collected: claim != null,
    collectedAt: (claim?.claimedAt ?? claim?.createdAt)?.toISOString() ?? null,
    redeemCode: claim?.redeemCode ?? null,
    isRedeemed: claim?.isRedeemed ?? null,
    // Whatever gate a collected pin sat behind was cleared when it was collected.
    locked: claim == null && lockReason != null,
    lockReason: claim == null ? lockReason : null,
    tags: facts.tags,
  };
}

/** Every visible spot of a pin, with the viewer's claim applied the multi-spot way. */
export function spotsOf(pin: PinRow, viewer: Viewer): ArPin[] {
  const lockReason = lockReasonFor(pin, viewer);
  const anyClaim = pin.spots.flatMap((spot) => spot.claims)[0];
  return pin.spots.map((spot) => {
    const own = spot.claims[0];
    return toArPin(pin, spot, pin.isMultiSpot ? own : (own ?? anyClaim), lockReason);
  });
}

/** A lat/lng box around a circle, so the database can pre-filter on its index. */
export function boundingBox({
  lat,
  lng,
  radiusKm,
}: {
  lat: number;
  lng: number;
  radiusKm: number;
}) {
  const dLat = radiusKm / 111.32;
  const dLng = radiusKm / (111.32 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));
  return {
    latitude: { gte: Math.max(lat - dLat, -90), lte: Math.min(lat + dLat, 90) },
    longitude: { gte: Math.max(lng - dLng, -180), lte: Math.min(lng + dLng, 180) },
  };
}

/**
 * Everything both ways of collecting check, apart from where the fan is:
 * the spot exists, the pin is live, and the fan clears its gate right now.
 */
export async function assertCollectable(
  ctx: Pick<Context, "db" | "chain" | "session">,
  userId: string,
  spotId: string,
) {
  const spot = await ctx.db.pinSpot.findUnique({
    where: { id: spotId },
    include: { pin: { include: pinInclude(userId) } },
  });
  const pin = spot?.pin;
  if (
    !spot ||
    !pin ||
    spot.isHidden ||
    pin.isHidden ||
    pin.approval !== "APPROVED" ||
    (pin.restrictedToUserId && pin.restrictedToUserId !== userId)
  ) {
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "This pin doesn't exist." });
  }
  const now = new Date();
  if (pin.visibility === "DRAFT" || pin.endsAt < now) {
    throw new AppError(ErrorCodes.ITEM_NOT_AVAILABLE, { message: "This pin has ended." });
  }
  if (pin.startsAt > now) {
    throw new AppError(ErrorCodes.ITEM_NOT_AVAILABLE, { message: "This pin hasn't started yet." });
  }
  const lockReason = lockReasonFor(pin, await loadViewer(ctx, [pin]));
  if (lockReason) throw new AppError(ErrorCodes.AUTH_FORBIDDEN, { message: lockReason });
  return { spot, pin };
}

const isRedeemCodeClash = (error: unknown) =>
  error instanceof Error &&
  (error as { code?: string }).code === "P2002" &&
  JSON.stringify((error as { meta?: unknown }).meta ?? "").includes("redeem");

/**
 * Records the collect: refuses a second one, takes one claim off a capped pin
 * and writes the claim with a fresh redeem code, all in one transaction.
 */
export async function writeCollect(
  db: Db,
  userId: string,
  spot: { id: string },
  pin: Pick<PinRow, "id" | "isMultiSpot" | "claimLimit">,
) {
  const prior = await db.pinClaim.findFirst({
    where: pin.isMultiSpot ? { userId, spotId: spot.id } : { userId, spot: { pinId: pin.id } },
    select: { id: true },
  });
  if (prior)
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, {
      message: "You've already collected this one.",
    });

  // The redeem code is unique; on the rare clash, try again with a new one.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
        let remaining: number | null = null;
        if (pin.claimLimit > 0) {
          // Guarded in the WHERE, so two fans can't both take the last one.
          const taken = await tx.pin.updateMany({
            where: { id: pin.id, claimsLeft: { gt: 0 } },
            data: { claimsLeft: { decrement: 1 } },
          });
          if (taken.count === 0)
            throw new AppError(ErrorCodes.ITEM_NOT_AVAILABLE, {
              message: "Every one of these has been collected.",
            });
          remaining = (
            await tx.pin.findUniqueOrThrow({ where: { id: pin.id }, select: { claimsLeft: true } })
          ).claimsLeft;
        }
        const claim = await tx.pinClaim.create({
          data: {
            userId,
            spotId: spot.id,
            claimedAt: new Date(),
            redeemCode: generateRedeemCode(),
          },
          select: { id: true, redeemCode: true, claimedAt: true },
        });
        return {
          id: claim.id,
          redeemCode: claim.redeemCode,
          collectedAt: (claim.claimedAt ?? new Date()).toISOString(),
          remaining,
        };
      });
    } catch (error) {
      if (isRedeemCodeClash(error)) continue;
      throw error;
    }
  }
  throw new AppError(ErrorCodes.INTERNAL, { message: "Couldn't create a redeem code. Try again." });
}

/** How well a pin matches a search: a title hit beats one in the description. */
export function searchScore(
  pin: { title: string; description: string | null; artistName: string },
  tags: string[],
  terms: string[],
  phrase: string,
) {
  const title = pin.title.toLowerCase();
  const artist = pin.artistName.toLowerCase();
  const description = (pin.description ?? "").toLowerCase();
  const tagText = tags.map((tag) => tag.toLowerCase());
  const startsWord = (text: string, term: string) =>
    new RegExp(`(^|[^\\p{L}\\p{N}])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "u").test(text);

  let score = 0;
  if (title === phrase) score += 40;
  else if (title.startsWith(phrase)) score += 25;
  else if (title.includes(phrase)) score += 15;
  if (artist === phrase) score += 20;
  for (const term of terms) {
    if (title.startsWith(term)) score += 10;
    else if (startsWord(title, term)) score += 8;
    else if (title.includes(term)) score += 5;
    if (artist.startsWith(term)) score += 7;
    else if (artist.includes(term)) score += 4;
    if (tagText.includes(term)) score += 6;
    else if (tagText.some((tag) => tag.includes(term))) score += 3;
    if (startsWord(description, term)) score += 2;
    else if (description.includes(term)) score += 1;
  }
  return score;
}
