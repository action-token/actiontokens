import { describe, expect, it } from "vitest";

import { clock, progressPercent } from "./time";

describe("clock", () => {
  it("formats minutes and seconds", () => {
    expect(clock(0)).toBe("0:00");
    expect(clock(65.9)).toBe("1:05");
    expect(clock(600)).toBe("10:00");
  });
  it("shows 0:00 for bad numbers", () => {
    expect(clock(-3)).toBe("0:00");
    expect(clock(Number.NaN)).toBe("0:00");
    expect(clock(Number.POSITIVE_INFINITY)).toBe("0:00");
  });
});

describe("progressPercent", () => {
  it("is the share played", () => {
    expect(progressPercent(15, 30)).toBe(50);
    expect(progressPercent(0, 30)).toBe(0);
  });
  it("stays between 0 and 100", () => {
    expect(progressPercent(40, 30)).toBe(100);
    expect(progressPercent(-5, 30)).toBe(0);
  });
  it("is 0 while the length is unknown", () => {
    expect(progressPercent(5, 0)).toBe(0);
    expect(progressPercent(5, Number.NaN)).toBe(0);
    expect(progressPercent(5, Number.POSITIVE_INFINITY)).toBe(0);
  });
});
