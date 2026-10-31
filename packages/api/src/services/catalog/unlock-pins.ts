import type { Db, Prisma } from "@bandcoin/db";

/**
 * The places an NFT owner visits to unlock its locked content, as on the old
 * Bandcoin: one private pin per copy × locked piece with an unlock condition,
 * visible and collectable only by that copy's owner, one spot per place, each
 * collected separately. Progress belongs to the copy (the pin), so it carries
 * over when the copy changes hands; the pin just follows the new owner.
 *
 * Made right after a purchase, and again on demand when an owner opens the
 * item (anything missing is filled in; the unique edition + piece pair keeps
 * it to one pin each, even when two requests race).
 */

/** Unlock pins live five years, as on the old Bandcoin. */
const UNLOCK_PIN_YEARS = 5;

/** Leaves the private unlock pins out of the artist's and the admin's pin lists. */
export const notUnlockPin = { unlockLockedContentId: null } satisfies Prisma.PinWhereInput;

const isUniqueClash = (error: unknown) =>
  error instanceof Error && (error as { code?: string }).code === "P2002";

/** Creates any missing unlock pins for these copies of one item. Returns how many it made. */
export async function ensureUnlockPins(
  db: Db,
  itemId: string,
  editions: { id: string; ownerId: string }[],
  now = new Date(),
) {
  if (editions.length === 0) return 0;
  const [item, pieces, existing] = await Promise.all([
    db.item.findUnique({
      where: { id: itemId },
      select: { title: true, coverUrl: true, artistId: true },
    }),
    db.lockedContent.findMany({
      where: { itemId, unlockRule: { isNot: null } },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        label: true,
        unlockRule: {
          select: {
            radiusMeters: true,
            points: {
              orderBy: { sortOrder: "asc" },
              select: { latitude: true, longitude: true },
            },
          },
        },
      },
    }),
    db.pin.findMany({
      where: { unlockEditionId: { in: editions.map((edition) => edition.id) } },
      select: { unlockEditionId: true, unlockLockedContentId: true },
    }),
  ]);
  if (!item?.artistId || pieces.length === 0) return 0;
  const have = new Set(
    existing.map((pin) => `${pin.unlockEditionId}:${pin.unlockLockedContentId}`),
  );
  const endsAt = new Date(now);
  endsAt.setFullYear(endsAt.getFullYear() + UNLOCK_PIN_YEARS);

  let made = 0;
  for (const edition of editions) {
    for (const piece of pieces) {
      const rule = piece.unlockRule;
      const first = rule?.points[0];
      if (!rule || !first || have.has(`${edition.id}:${piece.id}`)) continue;
      try {
        await db.pin.create({
          data: {
            artistId: item.artistId,
            type: "OTHER",
            title: piece.label ? `Unlock: ${piece.label}` : `Unlock: ${item.title}`,
            description: `A place to visit to unlock locked content in ${item.title}.`,
            imageUrl: item.coverUrl,
            visibility: "PUBLIC",
            approval: "APPROVED",
            claimLimit: 0,
            claimsLeft: 0,
            startsAt: now,
            endsAt,
            latitude: first.latitude,
            longitude: first.longitude,
            radiusMeters: rule.radiusMeters,
            isMultiSpot: true,
            restrictedToUserId: edition.ownerId,
            unlockItemId: itemId,
            unlockEditionId: edition.id,
            unlockLockedContentId: piece.id,
            spots: {
              create: rule.points.map((point) => ({
                latitude: point.latitude,
                longitude: point.longitude,
              })),
            },
          },
        });
        made += 1;
      } catch (error) {
        // Made by a request that got there first: that's the one we wanted.
        if (!isUniqueClash(error)) throw error;
      }
    }
  }
  return made;
}

/** A copy changed hands: its unlock pins (and the progress on them) follow it to the new owner. */
export async function moveUnlockPins(db: Db, editionId: string, ownerId: string) {
  const { count } = await db.pin.updateMany({
    where: { unlockEditionId: editionId },
    data: { restrictedToUserId: ownerId },
  });
  return count;
}
