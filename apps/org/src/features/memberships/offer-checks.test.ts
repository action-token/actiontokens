import { describe, expect, it } from "vitest";

import { offerProblems } from "./offer-checks";

const draft = { amount: "1000", priceBandcoin: "50", priceUsd: "5", priceXlm: "20", note: "" };

describe("page asset offer checks", () => {
  it("is ready with an amount storage can cover and three prices", () => {
    expect(offerProblems(draft, "2000")).toEqual({ problems: {}, ready: true });
  });

  it("flags too many tokens, bad numbers and missing prices", () => {
    expect(offerProblems({ ...draft, amount: "2500" }, "2000").problems.amount).toBe(
      "Storage can offer 2,000 more.",
    );
    expect(offerProblems({ ...draft, amount: "-3" }, "2000").problems.amount).toMatch(/above zero/);
    expect(offerProblems({ ...draft, priceXlm: "" }, "2000").ready).toBe(false);
    expect(offerProblems({ ...draft, priceUsd: "0" }, "2000").problems.priceUsd).toBeTruthy();
  });
});
