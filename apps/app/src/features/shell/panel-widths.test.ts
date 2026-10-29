import { describe, expect, it } from "vitest";

import { clampWidth, DEFAULT_WIDTHS, LIMITS, nudge, widthFromDrag } from "./panel-widths";

describe("panel widths", () => {
  it("starts with a wider left sidebar than the old 220px", () => {
    expect(DEFAULT_WIDTHS.left).toBe(260);
    expect(DEFAULT_WIDTHS.right).toBe(320);
  });

  it("keeps each panel within its limits", () => {
    expect(clampWidth("left", 50)).toBe(LIMITS.left.min);
    expect(clampWidth("left", 9999)).toBe(LIMITS.left.max);
    expect(clampWidth("right", 400)).toBe(400);
    expect(clampWidth("right", Number.NaN)).toBe(DEFAULT_WIDTHS.right);
  });

  it("the left handle grows the panel as you drag right, the right handle as you drag left", () => {
    expect(widthFromDrag("left", 260, 40)).toBe(300);
    expect(widthFromDrag("right", 320, 40)).toBe(280);
    expect(widthFromDrag("right", 320, -60)).toBe(380);
  });

  it("arrow keys nudge by 16px toward the page's edge direction, within limits", () => {
    expect(nudge("left", 260, "ArrowRight")).toBe(276);
    expect(nudge("left", 260, "ArrowLeft")).toBe(244);
    expect(nudge("right", 320, "ArrowLeft")).toBe(336);
    expect(nudge("right", 320, "ArrowRight")).toBe(304);
    expect(nudge("left", LIMITS.left.max, "ArrowRight")).toBe(LIMITS.left.max);
    expect(nudge("left", 260, "Enter")).toBeNull();
  });
});
