import { describe, expect, it } from "vitest";

import { topUpChoice } from "./choice";

describe("top-up choice", () => {
  it("sends the picked package, or the popular one by default", () => {
    expect(topUpChoice({ kind: "package", packageId: "p2" }, "", "p1")).toEqual({
      ok: true,
      input: { packageId: "p2" },
    });
    expect(topUpChoice({ kind: "package", packageId: null }, "", "p1")).toEqual({
      ok: true,
      input: { packageId: "p1" },
    });
    expect(topUpChoice({ kind: "package", packageId: null }, "", null)).toMatchObject({
      ok: false,
    });
  });

  it("takes any amount from $1 to $500, to the cent", () => {
    expect(topUpChoice({ kind: "amount" }, "2.499", null)).toEqual({
      ok: true,
      input: { usd: 2.5 },
    });
    expect(topUpChoice({ kind: "amount" }, "0.5", null)).toEqual({
      ok: false,
      problem: "Top up between $1 and $500.",
    });
    expect(topUpChoice({ kind: "amount" }, "", null)).toEqual({
      ok: false,
      problem: "Type an amount in dollars.",
    });
  });
});
