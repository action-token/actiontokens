import { describe, expect, it } from "vitest";

import { isEmail, mustNotPayAgain, sameTotal } from "./guest-rules";

describe("isEmail", () => {
  it("accepts an address, ignoring spaces around it", () => {
    expect(isEmail("fan@example.com")).toBe(true);
    expect(isEmail("  fan@example.com ")).toBe(true);
  });

  it("waits for a whole address before asking for a price", () => {
    for (const partial of ["", "fan", "fan@", "fan@example", "fan@@example.com", "a b@c.d"])
      expect(isEmail(partial)).toBe(false);
  });
});

describe("sameTotal", () => {
  it("compares amounts, not how they are written", () => {
    expect(sameTotal([{ amount: "1.99" }], [{ amount: "1.9900000" }])).toBe(true);
  });

  it("catches a price that moved, and a missing total", () => {
    expect(sameTotal([{ amount: "1.99" }], [{ amount: "2.05" }])).toBe(false);
    expect(sameTotal(undefined, [{ amount: "2.05" }])).toBe(false);
  });
});

describe("mustNotPayAgain", () => {
  it("blocks paying again only when the payment may still land", () => {
    expect(mustNotPayAgain("STELLAR_TX_SUBMIT_FAILED")).toBe(true);
    for (const settled of ["STELLAR_TX_REJECTED", "STELLAR_QUOTE_EXPIRED", null, undefined])
      expect(mustNotPayAgain(settled)).toBe(false);
  });
});
