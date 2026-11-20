import { describe, expect, it } from "vitest";

import { timeAgo } from "./format";

describe("timeAgo", () => {
  const now = Date.parse("2026-10-29T12:00:00Z");

  it("says just now under a minute", () => {
    expect(timeAgo(new Date(now - 30_000), now)).toBe("just now");
  });

  it("picks the largest whole unit", () => {
    expect(timeAgo(new Date(now - 3 * 60_000), now)).toBe("3 minutes ago");
    expect(timeAgo(new Date(now - 26 * 3_600_000), now)).toBe("yesterday");
    expect(timeAgo(new Date(now - 40 * 86_400_000), now)).toBe("last month");
  });
});
