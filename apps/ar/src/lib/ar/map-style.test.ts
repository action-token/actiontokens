import { describe, expect, it } from "vitest";

import { MAP_MODE_STORAGE_KEY } from "./theme";

describe("AR's saved map choices", () => {
  it("keep the keys people already have, so nobody loses their choice", () => {
    expect(MAP_MODE_STORAGE_KEY).toBe("bandcoin-ar-map-mode");
  });
});
