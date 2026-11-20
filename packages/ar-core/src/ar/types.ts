/**
 * ── AR domain types ────────────────────────────────────────────────────────
 *
 * What `Pin` + `PinSpot` + `PinClaim` + `Artist` produce in one query,
 * flattened the way the screens use it: ISO date strings, plus the derived
 * fields (rarity, status, lock) the database doesn't store.
 */

import type { PinLayerRef } from "../layers";
import type { ResolvedPinLook } from "../pin-look";

/** How a pin proves you're there: GPS near the spot, or its printed QR code. */
export type DetectionMethod = "gps" | "qr" | "image";

/** How exclusive a pin is, derived from its visibility. @see deriveRarity */
export type Rarity = "common" | "rare" | "epic" | "legendary" | "mythic";

/**
 * Everything that decides whether the Capture button is live. Ordered by
 * precedence: a collected pin reads "collected" even if it has also expired,
 * because that's the fact the collector cares about.
 */
export type PinStatus = "collected" | "expired" | "depleted" | "locked" | "collectible";

/** `Pin.type`: what kind of stop the artist says this is. */
export type ArPinType = "EVENT" | "BOUNTY" | "EXPERIENCE" | "LAUNCH" | "OTHER" | "LANDMARK";

export interface ArPin {
  id: string;
  type: ArPinType;
  lat: number;
  lng: number;
  title: string;
  description: string;
  /** Card art. Falls back to the artist avatar server-side, never empty. */
  imageUrl: string;
  link: string | null;

  organizationId: string;
  artistName: string;
  artistImageUrl: string;

  /** Claims left (0 = all claimed), or null when the pin has no cap. */
  remaining: number | null;
  /** `Pin.claimLimit`, or null when uncapped (0), so "x of y" drops the "of y". */
  supply: number | null;
  /** Resolved server-side: ranking a tier needs the artist's whole ladder. */
  rarity: Rarity;

  /** Claimed without tapping Capture, if the collector opted in. */
  autoCollect: boolean;
  detection: DetectionMethod;

  /** ISO. Null means the drop never expires. */
  endsAt: string | null;

  // ── Per-collector state (null / false for a logged-out viewer) ──────────
  collected: boolean;
  collectedAt: string | null;
  redeemCode: string | null;
  isRedeemed: boolean | null;
  /**
   * Gated behind something the viewer hasn't met — following the artist, or
   * holding enough of their fan token. Every pin is visible to everyone; this is
   * what decides whether it can be captured, not whether it's on the map.
   */
  locked: boolean;
  /** Why it's locked, phrased as the action that unlocks it. Null if open. */
  lockReason: string | null;
  /**
   * Set when only the Subscribers rule keeps a signed-in fan out and the artist
   * has a fan token: the sheet offers Follow (if `following` is false), then Subscribe.
   */
  subscribe: { following: boolean } | null;

  /** This pin's own tag labels (`ArArtist.categories` is the union across an artist's pins). */
  tags: string[];

  /** The artist's map layer it is in (plan 42); null is a regular pin. */
  layer: PinLayerRef | null;

  /** How the pin is drawn on the maps (plan 43), every fallback already applied. */
  look: ResolvedPinLook;
}

export interface ArArtist {
  id: string;
  name: string;
  /** The artist's slug, as on bandcoin.io/artist/[slug]. */
  handle: string;
  /** No column backs a short line yet, so always null (never a slice of the bio). */
  tagline: string | null;
  bio: string;
  avatarUrl: string;
  coverUrl: string | null;
  /** The artist profile is approved by an admin. */
  verified: boolean;
  followed: boolean;
  /** The viewer trusts the artist's fan token (a subscriber). */
  subscribed: boolean;
  /** The artist's fan token code, which a fan trusts to subscribe; null when they have none. */
  fanToken: string | null;
  followers: number;
  /** Live, approved pins this artist currently has on the map. */
  pinCount: number;
  /** The artist's tag labels, across their pins. */
  categories: string[];
  /** No column names a place yet, so always null. */
  region: string | null;
}

export interface ArUser {
  id: string;
  name: string;
  handle: string;
  avatarUrl: string;
  /** Truncated Stellar pubkey, shown on the profile. */
  pubkey: string;
  joinedAt: string;
  collectedCount: number;
  artistsFollowed: number;
  /** Distance walked while collecting, in metres. A vanity stat, on purpose. */
  distanceTravelled: number;
  balance: number;
}

export interface ArSettings {
  /** Claim eligible pins automatically as you walk past them. */
  autoCollect: boolean;
  /** Show only pins from artists you follow. */
  followingOnly: boolean;
  haptics: boolean;
  sound: boolean;
  /** Keep the map rotated to your heading instead of north-up. */
  compassMode: boolean;
}

/** What the user is doing on the map, for the travel-mode direction sheet. */
export type TravelMode = "walk" | "cycle" | "transit" | "drive";

export interface Coords {
  lat: number;
  lng: number;
}

/**
 * A live GPS fix. `heading` and `speed` come straight off the Geolocation
 * API and are null indoors or when stationary — the puck has to cope.
 */
export interface GeoFix extends Coords {
  accuracy: number;
  heading: number | null;
  speed: number | null;
  timestamp: number;
}

// ── Events & announcements ─────────────────────────────────────────────────
// Dates are ISO strings rather than `Date`s so the tRPC (superjson) and the
// mobile REST (plain JSON) responses have one shape between them.

/** The artist line shown on every event and announcement. */
export interface ArEventArtist {
  id: string;
  name: string;
  imageUrl: string;
}

export interface ArEventCard {
  id: string;
  title: string;
  coverImage: string | null;
  startDate: string;
  /** Null for a single-moment event; treat it as ending when it starts. */
  endDate: string | null;
  venueName: string | null;
  address: string | null;
  /** True when a lat/lng was set — the detail page shows a mini map. */
  hasVenue: boolean;
  /** True when the artist added a ticket / livestream / registration link. */
  hasLink: boolean;
  artist: ArEventArtist;
  goingCount: number;
  /** Null = unlimited RSVPs. */
  capacity: number | null;
  viewer: { going: boolean };
}

export interface ArEventDetail extends ArEventCard {
  description: string;
  latitude: number | null;
  longitude: number | null;
  link: string | null;
  linkLabel: string | null;
  /** Linked drops — `id` is a `PinSpot` id, the same one `pin.byId` takes. */
  pins: { id: string; title: string; imageUrl: string }[];
  bounties: { id: string; title: string; imageUrl: string | null }[];
  commentCount: number;
  isFull: boolean;
  isPast: boolean;
}

export interface ArAnnouncement {
  id: string;
  title: string;
  body: string;
  images: string[];
  pinned: boolean;
  ctaLabel: string | null;
  ctaUrl: string | null;
  expiresAt: string | null;
  createdAt: string;
  artist: ArEventArtist;
  commentCount: number;
}

export type ArCommentTarget = { kind: "event" | "announcement"; id: string };

export interface ArComment {
  id: string;
  content: string;
  createdAt: string;
  author: { id: string; name: string | null; image: string | null };
  mine: boolean;
}
