import { describe, expect, it } from "vitest";

import { DEFAULT_LOOK, toLookValue } from "./look-value";

describe("a pin look in the form", () => {
  it("starts as a circle with the artist's picture and the badge on", () => {
    expect(DEFAULT_LOOK).toEqual({
      shape: "circle",
      fill: "ARTIST",
      color: null,
      imageFit: null,
      autoBadge: true,
    });
  });

  it("fills in what an older pin or a template left out", () => {
    expect(toLookValue(undefined)).toEqual(DEFAULT_LOOK);
    expect(toLookValue({ shape: "note", color: "#0090FF" })).toEqual({
      ...DEFAULT_LOOK,
      shape: "note",
      color: "#0090FF",
    });
  });
});
