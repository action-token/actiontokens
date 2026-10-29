import { BANNED_NAMES } from "./banned-names";
import { isReservedName } from "./slug";

export const VANITY_MIN = 2;
export const VANITY_MAX = 30;
/** After a month runs out the link keeps working this long, so a late renewal loses nothing. */
export const VANITY_GRACE_DAYS = 7;
/** After the grace ends the name stays the artist's alone this long, then anyone can take it. */
export const VANITY_RESERVE_DAYS = 30;

export type VanityStatus = "TRIAL" | "ACTIVE" | "GRACE" | "LAPSED";

const DAY_MS = 24 * 60 * 60 * 1000;
const squash = (text: string) => text.toLowerCase().replace(/[\s_-]+/g, "");
const banned = new Set(BANNED_NAMES.map(squash));

export const normalizeVanityName = (raw: string) => raw.trim().replace(/^@/, "").toLowerCase();

/** null when the name can be used, otherwise what to tell the artist. */
export function validateVanityName(name: string): string | null {
  if (name.length < VANITY_MIN) return `Use at least ${VANITY_MIN} characters`;
  if (name.length > VANITY_MAX) return `Use at most ${VANITY_MAX} characters`;
  if (!/^[a-z0-9_-]+$/.test(name)) return "Use lowercase letters, numbers, - and _ only";
  if (!/^[a-z0-9]/.test(name)) return "Start with a letter or number";
  if (isReservedName(name) || banned.has(squash(name))) return "That name can't be used";
  return null;
}

/** Calendar months later, clamped to the end of a shorter month (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

export type VanityTimeline = {
  status: VanityStatus;
  /** Visitors who type the link reach the artist's page */
  works: boolean;
  /** The last moment the link works without a renewal being late */
  paidUntil: Date;
  graceEndsAt: Date;
  /** After this the name is free for anyone */
  heldUntil: Date;
};

/**
 * Where a link stands at `now`, worked out from its dates alone: it is right
 * the moment a month ends, without waiting for a background job to update it.
 * `stored` only tells a free first month (TRIAL) from a paid one (ACTIVE).
 */
export function vanityTimeline(
  link: { status: VanityStatus; paidUntil: Date },
  now: Date,
): VanityTimeline {
  const graceEndsAt = new Date(link.paidUntil.getTime() + VANITY_GRACE_DAYS * DAY_MS);
  const heldUntil = new Date(graceEndsAt.getTime() + VANITY_RESERVE_DAYS * DAY_MS);
  const status: VanityStatus =
    now <= link.paidUntil
      ? link.status === "TRIAL"
        ? "TRIAL"
        : "ACTIVE"
      : now <= graceEndsAt
        ? "GRACE"
        : "LAPSED";
  return { status, works: status !== "LAPSED", paidUntil: link.paidUntil, graceEndsAt, heldUntil };
}

/** A renewal adds a month to what is left, so paying early loses nothing; a late one starts today. */
export const renewalEnd = (paidUntil: Date, now: Date) =>
  addMonths(paidUntil > now ? paidUntil : now, 1);
