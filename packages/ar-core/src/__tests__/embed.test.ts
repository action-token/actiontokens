import { describe, expect, it } from "vitest";

import { accentVars, artistFilter, frameAncestors, normalizeConfig, normalizeDomain } from "../embed/config";

describe("embed config", () => {
  it("reads a saved row, falling back to safe defaults", () => {
    const config = normalizeConfig(
      { name: "My map", showUserLocation: true, pinSource: "ARTIST", artistId: "a1", accentColor: "red", eventsUrl: "javascript:alert(1)", zoom: 99 },
      "m1",
    );
    expect(config).toMatchObject({ id: "m1", userLocation: true, pinSource: "ARTIST", artistId: "a1", accentColor: "#dbdc2c", eventsUrl: null, zoom: 18 });
    expect(artistFilter(config)).toBe("a1");
    expect(artistFilter({ ...config, pinSource: "ALL" })).toBeUndefined();
  });

  it("only lets listed sites (and the artist portal) frame a map", () => {
    expect(frameAncestors([])).toBe("frame-ancestors *");
    const policy = frameAncestors(["https://www.Example.com/page", "not a domain!"]);
    expect(policy).toContain("https://example.com https://*.example.com");
    expect(policy).toContain("https://artist.bandcoin.io");
    expect(policy).not.toContain("not");
    expect(normalizeDomain("localhost")).toBe("localhost");
  });

  it("derives the accent tokens from the colour", () => {
    expect(accentVars("#dbdc2c")).toMatchObject({ "--ar-accent": "60 72% 52%", "--ar-accent-ink": "63 70% 6%" });
    expect(accentVars("#1d4ed8")["--ar-accent-ink"]).toBe("0 0% 100%");
  });
});
