import { describe, expect, it } from "vitest";

import { hasContextPanel } from "./panel-rule";

describe("hasContextPanel", () => {
  it("is empty on home until a song is loaded, then shows now playing", () => {
    expect(hasContextPanel("/", false)).toBe(false);
    expect(hasContextPanel("/", true)).toBe(true);
  });

  it("never shows on other pages, even while playing", () => {
    expect(hasContextPanel("/item/x", true)).toBe(false);
    expect(hasContextPanel("/collection", true)).toBe(false);
  });
});
