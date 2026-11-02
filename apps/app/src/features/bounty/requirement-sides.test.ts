import { describe, expect, it } from "vitest";

import { requirementSides, turnSide, visibleEntries } from "./requirement-sides";

describe("requirementSides", () => {
  it("puts music first when a bounty has both", () => {
    expect(
      requirementSides({ music: { mode: "HYBRID", tracks: [{}] }, instructions: ["Post it"] }),
    ).toEqual(["music", "general"]);
  });

  it("has one side when there is only one kind", () => {
    expect(requirementSides({ music: null, instructions: ["Post it"] })).toEqual(["general"]);
    expect(requirementSides({ music: { mode: "HYBRID", tracks: [{}] }, instructions: [] })).toEqual(
      ["music"],
    );
  });

  it("shows only the songs on a listening challenge, even if steps exist", () => {
    expect(
      requirementSides({ music: { mode: "MUSIC_ONLY", tracks: [{}] }, instructions: ["Old step"] }),
    ).toEqual(["music"]);
  });

  it("has no sides when nothing is required", () => {
    expect(requirementSides({ music: null, instructions: [] })).toEqual([]);
  });
});

describe("turnSide", () => {
  it("goes round both ways", () => {
    expect(turnSide(0, 1, 2)).toBe(1);
    expect(turnSide(1, 1, 2)).toBe(0);
    expect(turnSide(0, -1, 2)).toBe(1);
  });

  it("stays put with nothing to turn to", () => {
    expect(turnSide(0, 1, 1)).toBe(0);
    expect(turnSide(0, 1, 0)).toBe(0);
  });
});

describe("visibleEntries", () => {
  const seven = [1, 2, 3, 4, 5, 6, 7];

  it("shows 5, and says how many more there are", () => {
    expect(visibleEntries(seven, false)).toEqual({ shown: [1, 2, 3, 4, 5], extra: 2 });
  });

  it("shows them all when expanded", () => {
    expect(visibleEntries(seven, true).shown).toHaveLength(7);
  });

  it("offers no more when 5 or fewer", () => {
    expect(visibleEntries([1, 2, 3, 4, 5], false).extra).toBe(0);
  });
});
