import { describe, expect, it } from "vitest";

import { fromShared, toShared } from "./theme";

describe("AR's theme and the shared one", () => {
  it("calls auto 'system' in the cookie, and back", () => {
    expect(toShared("auto")).toBe("system");
    expect(fromShared("system")).toBe("auto");
  });

  it("keeps light and dark as they are", () => {
    for (const theme of ["light", "dark"] as const) {
      expect(toShared(theme)).toBe(theme);
      expect(fromShared(theme)).toBe(theme);
    }
  });
});
