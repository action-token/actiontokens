import { describe, expect, it } from "vitest";

import { browseFilter, formatPrice, formatUsd, MARKET_TYPES, marketItemUrl } from "./market";

describe("market links", () => {
  it("builds the item link from the slug", () => {
    expect(marketItemUrl("my song/1")).toMatch(/\/item\/my%20song%2F1$/);
  });
});

describe("prices", () => {
  it("writes two decimals at most, compact from 100,000", () => {
    expect(formatPrice("1250.5")).toBe("1,250.5");
    expect(formatPrice("12.345")).toBe("12.35");
    expect(formatPrice("18234000")).toBe("18.2M");
  });
  it("is null when unreadable", () => {
    expect(formatPrice(null)).toBeNull();
    expect(formatPrice("")).toBeNull();
    expect(formatPrice("abc")).toBeNull();
    expect(formatUsd(undefined)).toBeNull();
    expect(formatUsd("4.5")).toBe("≈ $4.5");
  });
});

describe("the type chips", () => {
  it("run in the fan app's order, ending with locked content", () => {
    expect(MARKET_TYPES.map((t) => t.id)).toEqual([
      "ALL",
      "TRACK",
      "IMAGE",
      "VIDEO",
      "TICKET",
      "FAN_TOKEN",
      "MERCH",
      "ROYALTY",
      "LOCKED",
    ]);
  });
  it("turn into browse filters", () => {
    expect(browseFilter("ALL")).toEqual({});
    expect(browseFilter("LOCKED")).toEqual({ locked: true });
    expect(browseFilter("TRACK")).toEqual({ type: "TRACK" });
  });
});
