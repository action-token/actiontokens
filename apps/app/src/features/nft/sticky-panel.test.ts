import { describe, expect, it } from "vitest";

import { stickyTop } from "./sticky-panel";

describe("stickyTop", () => {
  it("stays near the top when the panel fits", () => {
    expect(stickyTop(600, 900)).toBe(16);
  });

  it("sticks by its bottom when taller than the screen, so Pay stays reachable", () => {
    expect(stickyTop(1200, 900)).toBe(-324);
  });

  it("doesn't jump when the panel only just fits", () => {
    expect(stickyTop(860, 900)).toBe(16);
    expect(stickyTop(864, 900)).toBe(12);
  });
});
