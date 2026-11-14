import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS } from "./defaults";
import { useMuralLayer } from "./mural-layer";

describe("the map's settings (plan 46)", () => {
  it("collects by itself unless you switched it off", () => {
    expect(DEFAULT_SETTINGS.autoCollect).toBe(true);
    // Someone who saved their settings keeps their choice: stored values win over defaults.
    const merged = { ...DEFAULT_SETTINGS, ...{ autoCollect: false } };
    expect(merged.autoCollect).toBe(false);
  });

  it("shows every mural until you choose otherwise", () => {
    expect(useMuralLayer.getState().layer).toBe("all");
    useMuralLayer.getState().setLayer("verified");
    expect(useMuralLayer.getState().layer).toBe("verified");
    useMuralLayer.getState().setLayer("off");
    expect(useMuralLayer.getState().layer).toBe("off");
    useMuralLayer.getState().setLayer("all");
  });
});
