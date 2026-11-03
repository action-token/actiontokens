import { describe, expect, it } from "vitest";

import { priceLabel, TOOLS } from "./tools";

describe("Studio tools", () => {
  it("lists each kind of tool once, music priced from a clip", () => {
    expect(TOOLS.map((tool) => tool.type).sort()).toEqual([
      "IMAGE",
      "MUSIC_CLIP",
      "SEO",
      "SOCIAL",
      "TEXT",
      "VIDEO",
    ]);
  });

  it("shows a run's price in coins and dollars", () => {
    expect(priceLabel(6)).toBe("6 coins a run ($0.06)");
    expect(priceLabel(1)).toBe("1 coin a run ($0.01)");
    expect(priceLabel(1250)).toBe("1,250 coins a run ($12.50)");
  });
});
