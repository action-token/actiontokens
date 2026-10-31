import type { Db, LockedContentType, Prisma } from "@bandcoin/db";
import { AppError, ErrorCodes } from "@bandcoin/errors";
import { isOwnS3Url } from "@bandcoin/storage";

/**
 * Locked content inside a contract NFT, as on the old Bandcoin: songs, images,
 * videos or links only owners can open, each optionally behind an unlock
 * condition (visit these places, within a radius). Fixed once the NFT is
 * created: owners' unlock progress and the contract's unlock records point at
 * each item's `chainIndex`, its first position, which never changes.
 */
export const MAX_LOCKED_ITEMS = 20;
export const MAX_UNLOCK_PLACES = 20;
export const UNLOCK_RADIUS = { min: 10, max: 1000, default: 50 } as const;

export type UnlockPlaceInput = { lat: number; lng: number; label?: string };
export type LockedContentInput = {
  type: LockedContentType;
  url: string;
  label?: string;
  /** Visit these places to unlock; absent = open to every owner */
  unlock?: { radiusMeters: number; places: UnlockPlaceInput[] };
};

const invalid = (message: string) => new AppError(ErrorCodes.VALIDATION_FAILED, { message });

const isWebLink = (url: string) => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
};

/** Checks every item; the first problem is named by its position, as the form shows them. */
export function checkLockedContents(items: LockedContentInput[]) {
  if (items.length === 0) throw invalid("Add at least one piece of locked content.");
  if (items.length > MAX_LOCKED_ITEMS)
    throw invalid(`Up to ${MAX_LOCKED_ITEMS} pieces of locked content.`);
  items.forEach((item, index) => {
    const which = `Locked item ${index + 1}`;
    if ((item.label?.trim().length ?? 0) > 80)
      throw invalid(`${which}: keep the name to 80 characters.`);
    if (item.type === "OTHER") {
      if (!isWebLink(item.url)) throw invalid(`${which}: enter a web link starting with https://.`);
    } else if (!isOwnS3Url(item.url)) {
      throw invalid(`${which}: upload the file again.`);
    }
    if (!item.unlock) return;
    const { radiusMeters, places } = item.unlock;
    if (
      !Number.isFinite(radiusMeters) ||
      radiusMeters < UNLOCK_RADIUS.min ||
      radiusMeters > UNLOCK_RADIUS.max
    )
      throw invalid(
        `${which}: the radius can be from ${UNLOCK_RADIUS.min} to ${UNLOCK_RADIUS.max} m.`,
      );
    if (places.length === 0)
      throw invalid(`${which}: add at least one place, or turn the condition off.`);
    if (places.length > MAX_UNLOCK_PLACES)
      throw invalid(`${which}: up to ${MAX_UNLOCK_PLACES} places.`);
    for (const place of places) {
      if (
        !Number.isFinite(place.lat) ||
        !Number.isFinite(place.lng) ||
        Math.abs(place.lat) > 90 ||
        Math.abs(place.lng) > 180
      )
        throw invalid(`${which}: one of the places isn't on the map.`);
      if ((place.label?.trim().length ?? 0) > 80)
        throw invalid(`${which}: keep place names to 80 characters.`);
    }
  });
}

/** The nested create for a new NFT; each item's chainIndex is its position, for good. */
export function lockedContentsCreate(
  items: LockedContentInput[],
): Prisma.LockedContentCreateWithoutItemInput[] {
  return items.map((item, index) => ({
    type: item.type,
    url: item.url.trim(),
    label: item.label?.trim() || null,
    sortOrder: index,
    chainIndex: index,
    ...(item.unlock
      ? {
          unlockRule: {
            create: {
              radiusMeters: Math.round(item.unlock.radiusMeters),
              points: {
                create: item.unlock.places.map((place, order) => ({
                  latitude: place.lat,
                  longitude: place.lng,
                  label: place.label?.trim() || null,
                  sortOrder: order,
                })),
              },
            },
          },
        }
      : {}),
  }));
}

/** The NFT's locked content for its artist (who may see the links), in order. */
export async function lockedContentsFor(db: Db, itemId: string) {
  const rows = await db.lockedContent.findMany({
    where: { itemId },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      type: true,
      url: true,
      label: true,
      unlockRule: {
        select: {
          radiusMeters: true,
          points: {
            orderBy: { sortOrder: "asc" },
            select: { latitude: true, longitude: true, label: true },
          },
        },
      },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    url: row.url,
    label: row.label,
    unlock: row.unlockRule
      ? {
          radiusMeters: row.unlockRule.radiusMeters,
          places: row.unlockRule.points.map((point) => ({
            lat: point.latitude,
            lng: point.longitude,
            label: point.label,
          })),
        }
      : null,
  }));
}
