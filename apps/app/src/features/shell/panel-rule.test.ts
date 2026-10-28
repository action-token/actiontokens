import { describe, expect, it } from "vitest";

import { hasContextPanel } from "./panel-rule";

describe("hasContextPanel", () => {
  it("always shows on home", () => {
    expect(hasContextPanel("/", false)).toBe(true);
  });

  it("shows on music only while a song is loaded", () => {
    expect(hasContextPanel("/music", false)).toBe(false);
    expect(hasContextPanel("/music", true)).toBe(true);
  });

  it("never shows on other pages", () => {
    expect(hasContextPanel("/item/x", true)).toBe(false);
    expect(hasContextPanel("/u/theo", true)).toBe(false);
  });
});
