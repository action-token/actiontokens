import { describe, expect, it } from "vitest";

import {
  accentVars,
  artistFilter,
  decodePreview,
  frameAncestors,
  normalizeConfig,
  normalizeDomain,
} from "../embed/config";
import {
  DEFAULT_DRAFT,
  embedPageUrl,
  heroSnippet,
  iframeSnippet,
  previewUrl,
  scriptSnippet,
} from "../embed/snippets";

describe("embed config", () => {
  it("reads a saved row, falling back to safe defaults", () => {
    const config = normalizeConfig(
      {
        name: "My map",
        showUserLocation: true,
        pinSource: "ARTIST",
        organizationId: "a1",
        accentColor: "red",
        eventsUrl: "javascript:alert(1)",
        zoom: 99,
      },
      "m1",
    );
    expect(config).toMatchObject({
      id: "m1",
      userLocation: true,
      pinSource: "ARTIST",
      organizationId: "a1",
      accentColor: "#4dff2a",
      eventsUrl: null,
      zoom: 18,
    });
    expect(artistFilter(config)).toBe("a1");
    expect(artistFilter({ ...config, pinSource: "ALL" })).toBeUndefined();
  });

  it("only lets listed sites (and the artist portal) frame a map", () => {
    expect(frameAncestors([])).toBe("frame-ancestors *");
    const policy = frameAncestors(["https://www.Example.com/page", "not a domain!"]);
    expect(policy).toContain("https://example.com https://*.example.com");
    expect(policy).toContain("https://org.action-tokens.com");
    expect(policy).not.toContain("not");
    expect(normalizeDomain("localhost")).toBe("localhost");
  });

  it("derives the accent tokens from the colour", () => {
    expect(accentVars("#dbdc2c")).toMatchObject({
      "--ar-accent": "60 72% 52%",
      "--ar-accent-ink": "63 70% 6%",
    });
    expect(accentVars("#1d4ed8")["--ar-accent-ink"]).toBe("0 0% 100%");
  });
});

describe("embed snippets", () => {
  it("sends an unsaved draft to the preview and reads it back the same", () => {
    const url = new URL(
      previewUrl({ ...DEFAULT_DRAFT, name: "Tour — Zürich", showUserLocation: true }, "a1"),
    );
    expect(url.pathname).toBe("/embed/preview");
    const config = normalizeConfig(
      decodePreview(url.searchParams.get("c") ?? undefined) ?? {},
      "preview",
    );
    expect(config).toMatchObject({
      name: "Tour — Zürich",
      userLocation: true,
      organizationId: "a1",
      pinSource: "ARTIST",
    });
  });

  it("points every snippet at the map's id and the AR app", () => {
    expect(scriptSnippet("m1", 400)).toContain('data-bandcoin-embed="m1" style="height:400px"');
    expect(scriptSnippet("m1")).toContain("/embed.js");
    expect(iframeSnippet("m1")).toContain(`src="${embedPageUrl("m1")}"`);
    expect(iframeSnippet("m1")).toContain('allow="geolocation"');
    expect(heroSnippet("m1")).toContain('data-bandcoin-embed="m1"');
  });
});
