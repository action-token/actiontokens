import { describe, expect, it } from "vitest";

import { legacyRedirects } from "../legacy-redirects.mjs";

const rules = legacyRedirects({ portal: "https://portal.test", ar: "https://ar.test" });
const rule = (source: string) => rules.find((r) => r.source === source);

describe("old addresses", () => {
  it("sends one-thing links through the lookup", () => {
    expect(rule("/nft/:id")?.destination).toBe("/api/legacy/nft/:id");
    expect(rule("/artist/:id(G[A-Z2-7]{55})")?.destination).toBe("/api/legacy/artist/:id");
    // The more specific "manage" address must come before the general one.
    expect(rules.findIndex((r) => r.source === "/nft/manage/:id")).toBeLessThan(
      rules.findIndex((r) => r.source === "/nft/:id"),
    );
  });

  it("only treats a Stellar key as an old artist id, so new slugs still work", () => {
    const re = new RegExp(
      `^${rule("/artist/:id(G[A-Z2-7]{55})")!.source.replace(":id(", "(").replace(/\//g, "\\/")}$`,
    );
    expect(re.test("/artist/GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW")).toBe(true);
    expect(re.test("/artist/nova")).toBe(false);
  });

  it("sends the old portal pages to the portal and the old map to the AR app", () => {
    expect(rule("/artist/music")?.destination).toBe("https://portal.test/music");
    expect(rule("/artist/bounty/edit/:id")?.destination).toBe(
      "https://portal.test/bounties/:id/edit",
    );
    expect(rule("/admin/:path*")?.destination).toBe("https://portal.test/admin/:path*");
    expect(rule("/action/actions/:id")?.destination).toBe("https://ar.test/bounty/:id");
  });

  it("puts specific rules before the catch-alls that would hide them", () => {
    const at = (s: string) => rules.findIndex((r) => r.source === s);
    expect(at("/admin/creators")).toBeLessThan(at("/admin/:path*"));
    expect(at("/action/actions/:id")).toBeLessThan(at("/action/:path*"));
    expect(at("/artist/music/create")).toBeLessThan(at("/artist/music"));
    expect(at("/artist/map/collection-report/:path*")).toBeLessThan(at("/artist/map/:path*"));
  });

  it("never redirects to itself", () => {
    for (const r of rules) expect(r.destination).not.toBe(r.source);
  });
});
