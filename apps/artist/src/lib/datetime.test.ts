import { describe, expect, it } from "vitest";

import { fromLocalInput, toLocalInput } from "./datetime";

describe("datetime-local helpers", () => {
  it("round-trips a local time without shifting it", () => {
    const value = "2026-12-01T20:30";
    expect(toLocalInput(fromLocalInput(value)!)).toBe(value);
  });

  it("pads single digits", () => {
    expect(toLocalInput(new Date(2026, 0, 5, 7, 4))).toBe("2026-01-05T07:04");
  });

  it("treats an empty input as no date", () => {
    expect(fromLocalInput("")).toBeNull();
  });
});
