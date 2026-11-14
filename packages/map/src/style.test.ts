import { describe, expect, it } from "vitest";

import { storedChoice } from "./prefs";
import { isStandardStyle, MAP_BASES, mapStyleFor } from "./style";

describe("the map style for a type, mode and theme", () => {
  it("keeps the app's own look for Default", () => {
    expect(mapStyleFor("2d", "light")).toBe("mapbox://styles/mapbox/light-v11");
    expect(mapStyleFor("2d", "dark", "default")).toBe("mapbox://styles/mapbox/dark-v11");
    expect(mapStyleFor("3d", "dark")).toMatch(/^mapbox:\/\/styles\/wadzzo\//);
    expect(mapStyleFor("3d", "light")).not.toBe(mapStyleFor("3d", "dark"));
  });

  it("gives every type a style in both modes, whatever the theme", () => {
    for (const base of MAP_BASES)
      for (const mode of ["2d", "3d"] as const)
        for (const theme of ["light", "dark"] as const)
          expect(mapStyleFor(mode, theme, base)).toMatch(/^mapbox:\/\/styles\//);
  });

  it("uses Mapbox Standard in 3D for Streets and Satellite, and stays flat for the rest", () => {
    expect(mapStyleFor("3d", "light", "streets")).toBe("mapbox://styles/mapbox/standard");
    expect(mapStyleFor("3d", "dark", "satellite")).toBe(
      "mapbox://styles/mapbox/standard-satellite",
    );
    expect(mapStyleFor("3d", "light", "outdoors")).toBe(mapStyleFor("2d", "light", "outdoors"));
    expect(mapStyleFor("3d", "light", "dark")).toBe("mapbox://styles/mapbox/dark-v11");
  });

  it("knows which styles have slots for extra layers (Standard)", () => {
    expect(isStandardStyle("3d", "default")).toBe(true);
    expect(isStandardStyle("3d", "streets")).toBe(true);
    expect(isStandardStyle("3d", "satellite")).toBe(true);
    expect(isStandardStyle("3d", "outdoors")).toBe(false);
    expect(isStandardStyle("2d", "streets")).toBe(false);
  });
});

describe("a stored map choice", () => {
  it("starts on its fallback and remembers a choice even when storage is blocked", () => {
    const choice = storedChoice("test-key", "a", ["a", "b"] as const);
    expect(choice.read()).toBe("a");
    choice.write("b");
    expect(choice.read()).toBe("b");
  });
});
