import { describe, expect, it } from "vitest";

import { covers, ruleSummary } from "./bounty-rules";

describe("ruleSummary", () => {
  it("says what fans must do for each rule", () => {
    expect(ruleSummary({ ruleType: "ALL", trackCount: 3, requiredTracks: 1, totalPlays: 10 })).toBe(
      "Fans must listen to all 3 selected tracks until each reaches its play target.",
    );
    expect(
      ruleSummary({ ruleType: "ANY_N", trackCount: 4, requiredTracks: 2, totalPlays: 10 }),
    ).toBe("Fans must listen to any 2 of the 4 selected tracks.");
    expect(
      ruleSummary({ ruleType: "TOTAL_PLAYS", trackCount: 1, requiredTracks: 1, totalPlays: 25 }),
    ).toBe("Fans must reach 25 plays in total across the 1 selected track.");
  });

  it("never asks for more tracks than were added, and nudges when there are none", () => {
    expect(
      ruleSummary({ ruleType: "ANY_N", trackCount: 2, requiredTracks: 9, totalPlays: 1 }),
    ).toBe("Fans must listen to any 2 of the 2 selected tracks.");
    expect(
      ruleSummary({ ruleType: "ALL", trackCount: 0, requiredTracks: 1, totalPlays: 1 }),
    ).toMatch(/Add tracks/);
  });
});

describe("covers", () => {
  it("compares a balance with the prize, and stays quiet until both are known", () => {
    expect(covers("500", "250")).toBe(true);
    expect(covers("100", "250")).toBe(false);
    expect(covers(undefined, "250")).toBeNull();
    expect(covers("500", "")).toBeNull();
    expect(covers("500", "0")).toBeNull();
  });
});
