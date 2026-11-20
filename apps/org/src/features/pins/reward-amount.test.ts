import { describe, expect, it } from "vitest";

import { amountProblem, storageNote } from "./reward-amount";

describe("fan-token reward amount", () => {
  it("accepts empty (one token) and positive amounts up to 7 decimals", () => {
    for (const ok of ["", "1", "25", "0.5", "12.1234567"]) expect(amountProblem(ok)).toBeNull();
    for (const bad of ["0", "-1", "1.12345678", "ten", "1e3"])
      expect(amountProblem(bad)).toMatch(/above zero/);
  });

  it("compares what the pin can give with what storage holds", () => {
    const base = { code: "LUNA", inStorage: "1000" };
    expect(storageNote({ ...base, amount: "10", claimLimit: "50" })).toEqual({
      short: false,
      text: "Your storage holds 1,000 LUNA. This pin gives up to 500 LUNA.",
    });
    expect(storageNote({ ...base, amount: "", claimLimit: "" })).toEqual({
      short: false,
      text: "Your storage holds 1,000 LUNA.",
    });
    const short = storageNote({ ...base, amount: "10", claimLimit: "200" });
    expect(short?.short).toBe(true);
    expect(short?.text).toMatch(/up to 2,000 LUNA, so claims will wait/);
    expect(storageNote({ ...base, inStorage: null, amount: "10", claimLimit: "5" })).toBeNull();
  });
});
