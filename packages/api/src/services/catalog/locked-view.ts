import type { Db } from "@actiontokens/db";

import { contentCodeFor } from "./content-codes";
import { ensureUnlockPins } from "./unlock-pins";

/**
 * What fans see of a contract NFT's locked content, as on the old Bandcoin.
 *
 *   lockedPreview  → anyone, before buying: what each piece is and where its
 *                    places are. Never the links.
 *   lockedForOwner → the owner only: per copy, how many places are visited
 *                    and, once a piece is unlocked, its link. This is the
 *                    only place a locked link ever leaves the server.
 *
 * A piece without a condition is open to every owner at once. Progress is
 * counted per copy (the places visited on its pin, by whoever owned it), so
 * it carries over when the copy changes hands.
 */

const pieceSelect = {
  id: true,
  type: true,
  label: true,
  chainIndex: true,
  unlockRule: {
    select: {
      radiusMeters: true,
      points: {
        orderBy: { sortOrder: "asc" as const },
        select: { latitude: true, longitude: true, label: true },
      },
    },
  },
};

/** The locked pieces anyone can read about before buying: no links. */
export async function lockedPreview(db: Db, itemId: string) {
  const pieces = await db.lockedContent.findMany({
    where: { itemId },
    orderBy: { sortOrder: "asc" },
    select: pieceSelect,
  });
  return pieces.map((piece) => ({
    id: piece.id,
    type: piece.type,
    label: piece.label,
    unlock: piece.unlockRule
      ? {
          radiusMeters: piece.unlockRule.radiusMeters,
          places: piece.unlockRule.points.map((point) => ({
            lat: point.latitude,
            lng: point.longitude,
            label: point.label,
          })),
        }
      : null,
  }));
}

/** The viewer's copies of this NFT and, per copy, each piece's progress and (once unlocked) its link. */
export async function lockedForOwner(db: Db, userId: string, itemId: string) {
  const editions = await db.nftEdition.findMany({
    where: { itemId, ownerId: userId },
    orderBy: { tokenId: "asc" },
    select: { id: true, tokenId: true, ownerId: true },
  });
  if (editions.length === 0) return { copies: [] };
  // Fills in any unlock pins a purchase didn't get to make.
  await ensureUnlockPins(db, itemId, editions);

  const [pieces, pins] = await Promise.all([
    db.lockedContent.findMany({
      where: { itemId },
      orderBy: { sortOrder: "asc" },
      select: { ...pieceSelect, url: true },
    }),
    db.pin.findMany({
      where: { unlockEditionId: { in: editions.map((edition) => edition.id) } },
      select: {
        unlockEditionId: true,
        unlockLockedContentId: true,
        onChainUnlockedAt: true,
        onChainUnlockTxHash: true,
        spots: {
          where: { isHidden: false },
          select: { _count: { select: { claims: true } } },
        },
      },
    }),
  ]);

  const copies = editions.map((edition) => ({
    editionId: edition.id,
    tokenId: edition.tokenId,
    pieces: pieces.map((piece) => {
      const pin = pins.find(
        (row) => row.unlockEditionId === edition.id && row.unlockLockedContentId === piece.id,
      );
      const required = piece.unlockRule ? (pin?.spots.length ?? piece.unlockRule.points.length) : 0;
      const visited = pin?.spots.filter((spot) => spot._count.claims > 0).length ?? 0;
      const unlocked = !piece.unlockRule || (required > 0 && visited >= required);
      return {
        id: piece.id,
        type: piece.type,
        label: piece.label,
        required,
        visited,
        unlocked,
        url: unlocked ? piece.url : null,
        /** Recorded on the contract: when and the transaction */
        onChain: pin?.onChainUnlockedAt
          ? { at: pin.onChainUnlockedAt, txHash: pin.onChainUnlockTxHash }
          : null,
      };
    }),
  }));
  // The door code shows only once a piece is unlocked (made then, kept with the copy).
  return {
    copies: await Promise.all(
      copies.map(async ({ editionId, ...copy }) => ({
        ...copy,
        pieces: await Promise.all(
          copy.pieces.map(async (piece) => ({
            ...piece,
            code: piece.unlocked ? await contentCodeFor(db, editionId, piece.id) : null,
          })),
        ),
      })),
    ),
  };
}
