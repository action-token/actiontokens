import { describe, expect, it } from "vitest";

import { stickyTop } from "./sticky-panel";

describe("stickyTop", () => {
  it("stays under the header when the panel fits", () => {
    expect(stickyTop(600, 900)).toBe(80);
  });

  it("sticks by its bottom when taller than the screen, so Pay stays reachable", () => {
    expect(stickyTop(1200, 900)).toBe(-324);
  });

  it("doesn't jump when the panel only just fits", () => {
    expect(stickyTop(796, 900)).toBe(80);
    expect(stickyTop(800, 900)).toBe(76);
  });
});
