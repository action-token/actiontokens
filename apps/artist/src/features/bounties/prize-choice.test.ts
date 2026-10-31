import { describe, expect, it } from "vitest";

import { heldOf, prizeInput, prizeLabel, prizeOptions, tokenKey } from "./prize-choice";

const issuer = `G${"A".repeat(55)}`;
const holdings = {
  BANDCOIN: "50",
  XLM: "10",
  USDC: "0",
  others: [{ code: "LUNA", issuer, amount: "900" }],
};

describe("prize choice", () => {
  it("sends a platform currency, or any other token by code and issuer", () => {
    expect(prizeInput("XLM")).toEqual({ prizeCurrency: "XLM" });
    expect(prizeInput(tokenKey("LUNA", issuer))).toEqual({ prizeAsset: { code: "LUNA", issuer } });
    expect(prizeLabel("USDC")).toEqual({ currency: "USDC", code: "USDC" });
    expect(prizeLabel(tokenKey("LUNA", issuer))).toEqual({ currency: null, code: "LUNA" });
  });

  it("lists the currencies, then the tokens held, with balances", () => {
    expect(prizeOptions(holdings, "BANDCOIN").map((option) => [option.code, option.have])).toEqual([
      ["BANDCOIN", "50"],
      ["XLM", "10"],
      ["USDC", "0"],
      ["LUNA", "900"],
    ]);
    expect(heldOf(holdings, tokenKey("LUNA", issuer))).toBe("900");
    expect(heldOf(holdings, tokenKey("GONE", issuer))).toBe("0");
    expect(heldOf(undefined, "XLM")).toBeUndefined();
  });

  it("keeps a chosen token on the list after switching to a source without it", () => {
    const other = { ...holdings, others: [] };
    const options = prizeOptions(other, tokenKey("LUNA", issuer));
    expect(options.at(-1)).toEqual({
      key: tokenKey("LUNA", issuer),
      code: "LUNA",
      issuer,
      have: "0",
    });
  });
});
