import { describe, expect, it } from "vitest";

import { describeCounts, onSelectedLayer, REGULAR } from "./layer-view";

describe("the layer you're in on the map", () => {
  it("shows what's in the layer picked, and what's switched on with an eye", () => {
    expect(onSelectedLayer(null, null)).toBe(true);
    expect(onSelectedLayer("a", null)).toBe(false);
    expect(onSelectedLayer("a", "a")).toBe(true);
    expect(onSelectedLayer("b", "a")).toBe(false);
    expect(onSelectedLayer("b", "a", ["b"])).toBe(true);
    // The regular map is one of the eyes, too.
    expect(onSelectedLayer(null, "a", [REGULAR])).toBe(true);
    expect(onSelectedLayer(undefined, "a")).toBe(false);
  });

  it("says what's in a layer", () => {
    expect(describeCounts({ pins: 0, hotspots: 0 })).toBe("nothing");
    expect(describeCounts({ pins: 1, hotspots: 0 })).toBe("1 pin");
    expect(describeCounts({ pins: 3, hotspots: 1 })).toBe("3 pins and 1 hotspot");
  });
});
