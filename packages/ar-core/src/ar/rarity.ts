import type { ArPin, PinStatus, Rarity } from "./types";

/**
 * ── Rarity ─────────────────────────────────────────────────────────────────
 *
 * Rarity comes from how hard a pin is to get into, never from a field the
 * artist sets:
 *
 *   PUBLIC     anyone                                   common
 *   FOLLOWERS  the artist's followers                   rare
 *   MEMBERS    holders of any membership tier           epic
 *   TIER       holders of one tier, by its rung         epic → legendary → mythic
 *
 * Tiers rank within the artist's own ladder (tokens required, low to high),
 * because one artist's 50 tokens and another's aren't comparable, while
 * "this is their top tier" is.
 */

/** Mirrors Prisma's `Visibility`, without importing the client into UI code. */
export type PinVisibility = "DRAFT" | "PUBLIC" | "FOLLOWERS" | "MEMBERS" | "TIER";

export interface PinAccess {
  visibility: PinVisibility;
  /** Tokens the pin's tier needs. Only meaningful for TIER. */
  tierTokens?: number | null;
  /** Tokens every tier of this artist needs, in any order. */
  artistTierTokens?: number[];
}

/** Needs the artist's whole tier ladder, so the server ships it on the pin. */
export function deriveRarity(access: PinAccess): Rarity {
  if (access.visibility === "FOLLOWERS") return "rare";
  if (access.visibility === "MEMBERS") return "epic";
  if (access.visibility !== "TIER") return "common";

  const needed = access.tierTokens;
  // Two tiers needing the same amount are one rung.
  const rungs = [...new Set(access.artistTierTokens ?? [])].sort((a, b) => a - b);
  if (needed == null || rungs.length < 2) return "epic";
  if (needed >= rungs[rungs.length - 1]!) return "mythic";
  if (needed <= rungs[0]!) return "epic";
  return "legendary";
}

export const RARITY_ORDER: Rarity[] = ["common", "rare", "epic", "legendary", "mythic"];

export const RARITY_META: Record<
  Rarity,
  { label: string; short: string; hsl: string; blurb: string }
> = {
  common: {
    label: "Common",
    short: "C",
    hsl: "var(--rarity-common)",
    blurb: "Open to everyone",
  },
  rare: {
    label: "Rare",
    short: "R",
    hsl: "var(--rarity-rare)",
    blurb: "Followers only",
  },
  epic: {
    label: "Epic",
    short: "E",
    hsl: "var(--rarity-epic)",
    blurb: "Members",
  },
  legendary: {
    label: "Legendary",
    short: "L",
    hsl: "var(--rarity-legendary)",
    blurb: "Higher tier",
  },
  mythic: {
    label: "Mythic",
    short: "M",
    hsl: "var(--rarity-mythic)",
    blurb: "Top tier",
  },
};

/**
 * Resolve the one state that drives the whole card: which badge it wears,
 * whether Capture is live, whether the foil animates.
 *
 * Precedence matters. A pin you already hold reads "collected" even if the
 * drop has since expired or sold out — what you own doesn't un-own itself.
 */
export function pinStatus(pin: ArPin, now = Date.now()): PinStatus {
  if (pin.collected) return "collected";
  if (pin.locked) return "locked";
  if (pin.endsAt && new Date(pin.endsAt).getTime() < now) return "expired";
  if (pin.remaining !== null && pin.remaining <= 0) return "depleted";
  return "collectible";
}

export const STATUS_META: Record<
  PinStatus,
  { label: string; tone: "accent" | "gold" | "danger" | "muted" }
> = {
  collectible: { label: "Available", tone: "accent" },
  collected: { label: "Collected", tone: "gold" },
  expired: { label: "Expired", tone: "danger" },
  depleted: { label: "All claimed", tone: "danger" },
  locked: { label: "Locked", tone: "muted" },
};

/** Only `collectible` pins can ever be captured — in AR or anywhere else. */
export function isCapturable(pin: ArPin, now = Date.now()): boolean {
  return pinStatus(pin, now) === "collectible";
}

/**
 * "3 days left" / "4h left" / "Ends soon". Returns null for drops with no end
 * date so callers can omit the row entirely rather than print "never".
 */
export function timeRemaining(endsAt: string | null, now = Date.now()) {
  if (!endsAt) return null;
  const ms = new Date(endsAt).getTime() - now;
  if (ms <= 0) return { label: "Expired", urgent: true };

  const hours = ms / 3_600_000;
  if (hours < 1) return { label: "Ends within the hour", urgent: true };
  if (hours < 24) return { label: `${Math.floor(hours)}h left`, urgent: true };

  const days = Math.floor(hours / 24);
  return {
    label: `${days} day${days === 1 ? "" : "s"} left`,
    urgent: days <= 2,
  };
}
