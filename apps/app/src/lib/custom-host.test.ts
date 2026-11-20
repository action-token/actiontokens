import { describe, expect, it } from "vitest";

import { isOwnHost, routeCustomHost } from "./custom-host";

const APP = "https://app.action-tokens.com";

describe("custom domains in the fan app", () => {
  it("knows Bandcoin's own hosts", () => {
    for (const host of [
      "action-tokens.com",
      "ar.action-tokens.com",
      "app.action-tokens.com",
      "localhost:3000",
      "127.0.0.1:3000",
      "bandcoin-app.vercel.app",
      null,
    ]) {
      expect(isOwnHost(host, APP)).toBe(true);
    }
    expect(isOwnHost("coldplay.com", APP)).toBe(false);
    expect(isOwnHost("music.coldplay.com:443", APP)).toBe(false);
    // A look-alike isn't ours.
    expect(isOwnHost("notaction-tokens.com", APP)).toBe(false);
  });

  it("shows the artist page at the domain's home", () => {
    expect(routeCustomHost("Coldplay.com", "/", "", APP)).toEqual({
      kind: "home",
      rewrite: "/domain-site/coldplay.com",
    });
  });

  it("sends other paths to the same page on Bandcoin", () => {
    expect(routeCustomHost("coldplay.com", "/item/song-1", "?ref=x", APP)).toEqual({
      kind: "redirect",
      to: "https://app.action-tokens.com/item/song-1?ref=x",
    });
  });

  it("serves the API, Next's files and images on the domain itself", () => {
    for (const path of [
      "/api/trpc/artist.page",
      "/_next/static/a.js",
      "/api/media/preview/x",
      "/logo.png",
    ]) {
      expect(routeCustomHost("coldplay.com", path, "", APP)).toEqual({ kind: "pass" });
    }
  });

  it("leaves Bandcoin's own hosts alone", () => {
    expect(routeCustomHost("app.action-tokens.com", "/", "", APP)).toEqual({ kind: "own" });
  });
});
