import { describe, expect, it } from "vitest";

import { showSidebarBuy } from "./sidebar-buy";

const priced = { price: { actionToken: "9500", usd: "0.99" } };

describe("showSidebarBuy", () => {
  it("offers Buy while only the preview plays", () => {
    expect(showSidebarBuy(priced, { full: false })).toBe(true);
  });

  it("hides it once the listener has the full song", () => {
    expect(showSidebarBuy(priced, { full: true })).toBe(false);
  });

  it("hides it while playback is still loading, so it doesn't flash", () => {
    expect(showSidebarBuy(priced, undefined)).toBe(false);
  });

  it("hides it when the song has no price", () => {
    expect(showSidebarBuy({ price: null }, { full: false })).toBe(false);
    expect(showSidebarBuy({ price: undefined }, { full: false })).toBe(false);
  });
});
