import { describe, expect, it } from "vitest";

import { BOOT_WEIGHTS, bootProgress } from "./boot-progress";

const none = { fonts: false, hydrated: false, session: false, data: false };

describe("bootProgress", () => {
  it("weights add up to a full counter", () => {
    const sum = Object.values(BOOT_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1);
  });

  it("is 0 before anything is ready and 1 when everything is", () => {
    expect(bootProgress(none)).toBe(0);
    expect(bootProgress({ fonts: true, hydrated: true, session: true, data: true })).toBe(1);
  });

  it("counts each signal by its weight", () => {
    expect(bootProgress({ ...none, fonts: true })).toBe(0.25);
    expect(bootProgress({ ...none, hydrated: true, session: true })).toBe(0.4);
    expect(bootProgress({ ...none, data: true })).toBe(0.35);
  });
});
