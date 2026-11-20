import { describe, expect, it } from "vitest";

import {
  drawMessage,
  LARGE_SPAN_M,
  MIN_SPAN_M,
  SHAPES,
  spanOf,
  type AreaDrawing,
} from "./area-draw";

describe("how big a drawing is", () => {
  it("is the farthest two corners apart, in metres", () => {
    expect(spanOf([])).toBe(0);
    expect(spanOf([{ lat: 0, lng: 0 }])).toBe(0);
    // About 111 km per degree of latitude.
    const km = spanOf([
      { lat: 0, lng: 0 },
      { lat: 1, lng: 0 },
      { lat: 0.5, lng: 0 },
    ]);
    expect(km).toBeGreaterThan(110_000);
    expect(km).toBeLessThan(112_500);
  });

  it("treats under 10 m as a mis-click and over 50 km as worth a warning", () => {
    expect(MIN_SPAN_M).toBe(10);
    expect(LARGE_SPAN_M).toBe(50_000);
  });
});

const drawing = (over: Partial<AreaDrawing>) =>
  ({
    shape: "polygon",
    drawing: false,
    tooSmall: false,
    large: false,
    extent: 0,
    ...over,
  }) as AreaDrawing;

describe("what the tool tells you", () => {
  it("gives a two-step hint for every shape, ending in Finish area", () => {
    for (const entry of SHAPES) {
      expect(entry.hints).toHaveLength(2);
      expect(entry.hints[1]).toContain("Finish area");
    }
  });

  it("starts with the first click, then the next step", () => {
    expect(drawMessage(drawing({ shape: "circle" }))).toEqual({
      tone: "plain",
      text: "Click the centre",
    });
    expect(drawMessage(drawing({ shape: "circle", drawing: true })).text).toContain("Finish area");
  });

  it("says when the shape is too small or very large", () => {
    expect(drawMessage(drawing({ tooSmall: true }))).toMatchObject({ tone: "bad" });
    expect(drawMessage(drawing({ large: true, extent: 120_000 }))).toMatchObject({
      tone: "warn",
      text: expect.stringContaining("120 km"),
    });
  });
});
