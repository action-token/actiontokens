import { describe, expect, it } from "vitest";

import { formatCapsuleBalance } from "./balance";

describe("the profile capsule's balance", () => {
  it("shows it in full, to two decimals at most", () => {
    expect(formatCapsuleBalance("1250.5")).toBe("1,250.5");
    expect(formatCapsuleBalance("12.3456")).toBe("12.35");
    expect(formatCapsuleBalance(0)).toBe("0");
  });

  it("goes compact from 100,000", () => {
    expect(formatCapsuleBalance("99999")).toBe("99,999");
    expect(formatCapsuleBalance(1_250_000)).toBe("1.3M");
    expect(formatCapsuleBalance("100000")).toBe("100K");
  });

  it("says nothing when it can't be read", () => {
    expect(formatCapsuleBalance(null)).toBeNull();
    expect(formatCapsuleBalance(undefined)).toBeNull();
    expect(formatCapsuleBalance("")).toBeNull();
    expect(formatCapsuleBalance("abc")).toBeNull();
  });
});
