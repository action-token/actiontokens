import { describe, expect, it } from "vitest";

import { describeRun, lengthOf, quickEnds } from "./schedule-quick";

// Wednesday 12 Nov 2026, 3:30 PM (local).
const wed = new Date(2026, 10, 12, 15, 30);

describe("quick ways to end a pin", () => {
  it("offers today, this weekend, 1 week and 1 month", () => {
    const options = quickEnds(wed);
    expect(options.map((option) => option.id)).toEqual(["today", "weekend", "week", "month"]);
    expect(options[0]!.end).toEqual(new Date(2026, 10, 12, 23, 59));
    expect(options[1]!.end).toEqual(new Date(2026, 10, 15, 23, 59)); // Sunday
    expect(options[2]!.end).toEqual(new Date(2026, 10, 19, 15, 30));
    expect(options[3]!.end).toEqual(new Date(2026, 11, 12, 15, 30));
  });

  it("drops 'this weekend' on a Sunday, when it is the same as today", () => {
    const sunday = new Date(2026, 10, 15, 10, 0);
    expect(quickEnds(sunday).map((option) => option.id)).toEqual(["today", "week", "month"]);
  });
});

describe("a run in words", () => {
  it("says how long a run is", () => {
    expect(lengthOf(wed, new Date(wed.getTime() + 86_400_000))).toBe("1 day");
    expect(lengthOf(wed, new Date(wed.getTime() + 7 * 86_400_000))).toBe("7 days");
    expect(lengthOf(wed, new Date(wed.getTime() + 5 * 3_600_000))).toBe("5 hours");
    expect(lengthOf(wed, new Date(wed.getTime() + 40 * 60_000))).toBe("40 minutes");
  });

  it("starts now when it has no start, or a start already past", () => {
    const end = new Date(2026, 10, 19, 18, 0);
    expect(describeRun(null, end, wed, "en-US")).toBe(
      "Live now until Thu, Nov 19, 6:00 PM · 7 days",
    );
    expect(describeRun(new Date(2026, 10, 1), end, wed, "en-US")).toContain("Live now until");
  });

  it("says when a later start begins", () => {
    const start = new Date(2026, 10, 14, 9, 0);
    const end = new Date(2026, 10, 16, 9, 0);
    expect(describeRun(start, end, wed, "en-US")).toBe(
      "Starts Sat, Nov 14, 9:00 AM, ends Mon, Nov 16, 9:00 AM · 2 days",
    );
  });

  it("is empty without an end, or when it ends before it starts", () => {
    expect(describeRun(null, null, wed)).toBeNull();
    expect(describeRun(null, new Date(2026, 10, 11), wed)).toBeNull();
  });
});
