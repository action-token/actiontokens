import { describe, expect, it } from "vitest";

import { createMapPrefs } from "./prefs";

describe("an app's map choices", () => {
  it("are stored under the app's own prefix", () => {
    const ar = createMapPrefs("actiontokens-ar");
    expect(ar.keys).toEqual({
      mode: "actiontokens-ar-map-mode",
      base: "actiontokens-ar-map-base",
      terrain: "actiontokens-ar-map-terrain",
    });
  });

  it("start on 2D, the default type and no terrain, and remember a change when storage is blocked", () => {
    const prefs = createMapPrefs("test-a");
    expect(prefs.readMapMode()).toBe("2d");
    expect(prefs.readMapBase()).toBe("default");
    prefs.setMapMode("3d");
    prefs.setMapBase("satellite");
    expect(prefs.readMapMode()).toBe("3d");
    expect(prefs.readMapBase()).toBe("satellite");
  });

  it("don't leak between two apps", () => {
    const a = createMapPrefs("test-one");
    const b = createMapPrefs("test-two");
    a.setMapBase("streets");
    expect(b.readMapBase()).toBe("default");
  });
});
