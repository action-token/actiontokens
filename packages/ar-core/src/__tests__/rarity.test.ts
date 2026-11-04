import { describe, expect, it } from "vitest";

import { AR_CAPTURE_RADIUS, distanceMeters, formatDistance, offsetBy } from "../ar/geo";
import { deriveRarity, pinStatus, timeRemaining } from "../ar/rarity";
import type { ArPin } from "../ar/types";

describe("deriveRarity", () => {
  it("maps each visibility to its rung", () => {
    expect(deriveRarity({ visibility: "PUBLIC" })).toBe("common");
    expect(deriveRarity({ visibility: "FOLLOWERS" })).toBe("rare");
    expect(deriveRarity({ visibility: "SUBSCRIBERS" })).toBe("rare");
    expect(deriveRarity({ visibility: "MEMBERS" })).toBe("epic");
  });

  it("ranks a tier within the artist's own ladder", () => {
    const ladder = [10, 50, 200];
    expect(deriveRarity({ visibility: "TIER", tierTokens: 10, artistTierTokens: ladder })).toBe(
      "epic",
    );
    expect(deriveRarity({ visibility: "TIER", tierTokens: 50, artistTierTokens: ladder })).toBe(
      "legendary",
    );
    expect(deriveRarity({ visibility: "TIER", tierTokens: 200, artistTierTokens: ladder })).toBe(
      "mythic",
    );
  });

  it("calls a tier epic when there is no ladder to rank it on", () => {
    expect(deriveRarity({ visibility: "TIER", tierTokens: 50, artistTierTokens: [50, 50] })).toBe(
      "epic",
    );
    expect(deriveRarity({ visibility: "TIER", tierTokens: null, artistTierTokens: [1, 9] })).toBe(
      "epic",
    );
  });
});

const pin = (over: Partial<ArPin> = {}): ArPin => ({
  id: "spot",
  type: "OTHER",
  lat: 0,
  lng: 0,
  title: "Pin",
  description: "",
  imageUrl: "",
  link: null,
  artistId: "a",
  artistName: "A",
  artistImageUrl: "",
  remaining: 5,
  supply: null,
  rarity: "common",
  autoCollect: false,
  detection: "gps",
  endsAt: null,
  collected: false,
  collectedAt: null,
  redeemCode: null,
  isRedeemed: null,
  locked: false,
  lockReason: null,
  tags: [],
  ...over,
});

describe("pinStatus", () => {
  const now = Date.parse("2026-10-29T12:00:00Z");

  it("puts collected before every other state", () => {
    expect(
      pinStatus(pin({ collected: true, remaining: 0, endsAt: "2020-01-01T00:00:00Z" }), now),
    ).toBe("collected");
  });

  it("reports locked, expired and all-claimed pins", () => {
    expect(pinStatus(pin({ locked: true }), now)).toBe("locked");
    expect(pinStatus(pin({ endsAt: "2026-10-28T00:00:00Z" }), now)).toBe("expired");
    expect(pinStatus(pin({ remaining: 0 }), now)).toBe("depleted");
    expect(pinStatus(pin(), now)).toBe("collectible");
    expect(pinStatus(pin({ remaining: null }), now)).toBe("collectible");
  });

  it("says how long is left", () => {
    expect(timeRemaining(null, now)).toBeNull();
    expect(timeRemaining("2026-10-29T15:00:00Z", now)).toEqual({ label: "3h left", urgent: true });
    expect(timeRemaining("2026-11-08T12:00:00Z", now)).toEqual({
      label: "10 days left",
      urgent: false,
    });
  });
});

describe("geo", () => {
  it("measures and offsets distances in metres", () => {
    const from = { lat: 40.7128, lng: -74.006 };
    const moved = offsetBy(from, 100, 90);
    expect(distanceMeters(from, moved)).toBeCloseTo(100, 0);
    expect(distanceMeters(from, offsetBy(from, AR_CAPTURE_RADIUS, 0))).toBeLessThanOrEqual(
      AR_CAPTURE_RADIUS + 0.01,
    );
  });

  it("formats metres and kilometres", () => {
    expect(formatDistance(84.3)).toBe("84 m");
    expect(formatDistance(1430)).toBe("1.4 km");
    expect(formatDistance(Number.NaN)).toBe("—");
  });
});
