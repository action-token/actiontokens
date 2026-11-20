import { describe, expect, it } from "vitest";

import { dropCount, dropPlan } from "./schedule";

const start = new Date("2026-11-05T10:00:00Z");
const days = (n: number) => new Date(start.getTime() + n * 86_400_000);

describe("hotspot schedule", () => {
  it("counts the start-date drop and every one after it before the end", () => {
    expect(dropCount(start, days(30), 7)).toBe(5);
    expect(dropCount(start, days(7), 7)).toBe(1);
    expect(dropCount(start, days(1), 1)).toBe(1);
    expect(dropCount(start, days(-1), 1)).toBe(0);
  });

  it("says the plan in plain words", () => {
    expect(dropPlan({ start, end: days(30), dropEveryDays: 7 })).toBe(
      "Drops every 7 days from Nov 5, 2026 to Dec 5, 2026: about 5 drops.",
    );
    expect(dropPlan({ start, end: days(1), dropEveryDays: 1 })).toMatch(/every day .*: 1 drop\./);
    expect(dropPlan({ start, end: null, dropEveryDays: 7 })).toBe(
      "Pick an end date and how often it drops.",
    );
  });
});
