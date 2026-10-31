import type { Db } from "@bandcoin/db";
import { AppError, ErrorCodes } from "@bandcoin/errors";
import { generateRedeemCode } from "@bandcoin/utils/redeem-code";

/**
 * Door codes for locked content, as on the old Bandcoin: one per copy and
 * locked piece, shown to the owner once that piece is unlocked (the artist
 * checks it at the door, on the same Redeem page as pin codes). A code
 * belongs to the copy, not the person, so it stays with a copy that changes
 * hands. Only the NFT's own artist can look a code up or redeem it, and a
 * code for a piece that isn't unlocked yet can't be redeemed.
 */

const isClash = (error: unknown) =>
  error instanceof Error && (error as { code?: string }).code === "P2002";

/** The copy's code for this piece, made the first time it's asked for. */
export async function contentCodeFor(db: Db, editionId: string, lockedContentId: string) {
  const existing = await db.lockedContentRedeem.findUnique({
    where: { editionId_lockedContentId: { editionId, lockedContentId } },
    select: { code: true, redeemedAt: true },
  });
  if (existing) return existing;
  // A clash with another code (or a racing request for this one) just tries again.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateRedeemCode();
    // Pin codes share the Redeem page, so a code must not match one of those either.
    if (await db.pinClaim.findFirst({ where: { redeemCode: code }, select: { id: true } }))
      continue;
    try {
      return await db.lockedContentRedeem.create({
        data: { code, editionId, lockedContentId },
        select: { code: true, redeemedAt: true },
      });
    } catch (error) {
      if (!isClash(error)) throw error;
      const raced = await db.lockedContentRedeem.findUnique({
        where: { editionId_lockedContentId: { editionId, lockedContentId } },
        select: { code: true, redeemedAt: true },
      });
      if (raced) return raced;
    }
  }
  throw new AppError(ErrorCodes.INTERNAL, { message: "Couldn't make a code. Try again." });
}

const select = {
  code: true,
  redeemedAt: true,
  createdAt: true,
  edition: {
    select: {
      id: true,
      tokenId: true,
      owner: {
        select: { id: true, username: true, displayName: true, avatarUrl: true, email: true },
      },
      unlockPins: {
        select: {
          unlockLockedContentId: true,
          spots: { where: { isHidden: false }, select: { _count: { select: { claims: true } } } },
        },
      },
    },
  },
  lockedContent: {
    select: {
      id: true,
      label: true,
      type: true,
      unlockRule: { select: { id: true } },
      item: { select: { title: true, coverUrl: true, artistId: true } },
    },
  },
} as const;

/** A content code of this artist's NFTs, described like a pin code for the Redeem page; null when there's none. */
export async function findContentCode(db: Db, artistId: string, code: string) {
  const row = await db.lockedContentRedeem.findFirst({
    where: { code, lockedContent: { item: { artistId } } },
    select,
  });
  if (!row) return null;
  const piece = row.lockedContent;
  const pin = row.edition.unlockPins.find((entry) => entry.unlockLockedContentId === piece.id);
  const unlocked =
    !piece.unlockRule ||
    Boolean(pin && pin.spots.length > 0 && pin.spots.every((spot) => spot._count.claims > 0));
  const owner = row.edition.owner;
  return {
    unlocked,
    claim: {
      id: row.code,
      code: row.code,
      redeemedAt: row.redeemedAt,
      collectedAt: row.createdAt,
      fan: {
        id: owner.id,
        name: owner.displayName ?? owner.username,
        image: owner.avatarUrl,
        email: owner.email,
      },
      pin: {
        id: piece.id,
        title: `${piece.label ?? "Locked content"} · ${piece.item.title} #${row.edition.tokenId}`,
        imageUrl: piece.item.coverUrl,
        type: "OTHER" as const,
      },
      latitude: null,
      longitude: null,
    },
  };
}

/** Marks a content code redeemed by this artist's user; only a code nobody redeemed yet matches. */
export async function redeemContentCode(db: Db, code: string, redeemedById: string | null) {
  const redeemedAt = new Date();
  const { count } = await db.lockedContentRedeem.updateMany({
    where: { code, redeemedAt: null },
    data: { redeemedAt, redeemedById },
  });
  return count === 1 ? redeemedAt : null;
}
