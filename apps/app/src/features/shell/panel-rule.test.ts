import { describe, expect, it } from "vitest";

import { hasContextPanel } from "./panel-rule";

describe("hasContextPanel", () => {
  it("always shows on home, which now holds all the music too", () => {
    expect(hasContextPanel("/")).toBe(true);
  });

  it("never shows on other pages", () => {
    expect(hasContextPanel("/item/x")).toBe(false);
    expect(hasContextPanel("/u/theo")).toBe(false);
    expect(hasContextPanel("/collection")).toBe(false);
  });
});
