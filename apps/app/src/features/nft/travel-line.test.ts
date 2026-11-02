import { describe, expect, it } from "vitest";

import { travelLine } from "./travel-line";

describe("travelLine", () => {
  it("says everything opens right away when no place is needed", () => {
    expect(travelLine(1, 0, 0)).toBe("Its reward opens as soon as you own a copy.");
    expect(travelLine(3, 0, 0)).toBe("All 3 rewards open as soon as you own a copy.");
  });

  it("says everything stays locked when every reward needs a place", () => {
    expect(travelLine(1, 1, 1)).toBe("Its reward stays locked until you visit 1 place in person.");
    expect(travelLine(2, 2, 3)).toBe(
      "All 2 rewards stay locked until you visit 3 places in person.",
    );
  });

  it("splits a mix, in plain grammar", () => {
    expect(travelLine(2, 1, 2)).toBe(
      "1 of 2 rewards opens right away. The other one needs a visit to 2 places in person.",
    );
    expect(travelLine(5, 3, 1)).toBe(
      "2 of 5 rewards open right away. The other 3 need a visit to 1 place in person.",
    );
  });
});
