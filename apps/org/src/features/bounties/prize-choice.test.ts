import { describe, expect, it } from "vitest";

import {
  choiceValue,
  heldOf,
  parseChoice,
  prizeGroups,
  prizeInput,
  prizeLabel,
  tokenKey,
} from "./prize-choice";

const issuer = `G${"A".repeat(55)}`;
const other = `G${"B".repeat(55)}`;
const fanToken = { code: "LUNA", issuer };
const wallet = {
  ACTION: "50",
  XLM: "10",
  USDC: "0",
  others: [
    { code: "MISC", issuer: other, amount: "5" },
    { code: "LUNA", issuer, amount: "900" },
  ],
};
const storage = {
  ACTION: "0",
  XLM: "1",
  USDC: "0",
  others: [{ code: "LUNA", issuer, amount: "1000000" }],
};

describe("prize choice", () => {
  it("sends a platform currency, or any other token by code and issuer", () => {
    expect(prizeInput("XLM")).toEqual({ prizeCurrency: "XLM" });
    expect(prizeInput(tokenKey("LUNA", issuer))).toEqual({ prizeAsset: { code: "LUNA", issuer } });
    expect(prizeLabel("USDC")).toEqual({ currency: "USDC", code: "USDC" });
    expect(prizeLabel(tokenKey("LUNA", issuer))).toEqual({ currency: null, code: "LUNA" });
  });

  it("one choice carries the token and where it comes from", () => {
    const value = choiceValue("storage", tokenKey("LUNA", issuer));
    expect(parseChoice(value)).toEqual({ source: "storage", key: tokenKey("LUNA", issuer) });
    expect(parseChoice(choiceValue("wallet", "XLM"))).toEqual({ source: "wallet", key: "XLM" });
  });

  it("groups wallet and storage, the fan token first in each", () => {
    const groups = prizeGroups({ wallet, storage, fanToken }, { source: "wallet", key: "ACTION" });
    expect(groups.map((group) => group.source)).toEqual(["wallet", "storage"]);
    expect(groups[0]?.options.map((option) => [option.code, option.have, option.fanToken])).toEqual(
      [
        ["LUNA", "900", true],
        ["ACTION", "50", false],
        ["XLM", "10", false],
        ["USDC", "0", false],
        ["MISC", "5", false],
      ],
    );
    expect(groups[1]?.options[0]).toMatchObject({ code: "LUNA", have: "1000000", fanToken: true });
    expect(heldOf(storage, tokenKey("LUNA", issuer))).toBe("1000000");
    expect(heldOf(undefined, "XLM")).toBeUndefined();
  });

  it("shows storage only when it's open, and keeps a chosen token that's gone", () => {
    const noStorage = prizeGroups(
      { wallet, storage: null, fanToken },
      { source: "wallet", key: tokenKey("GONE", other) },
    );
    expect(noStorage).toHaveLength(1);
    expect(noStorage[0]?.options.at(-1)).toMatchObject({ code: "GONE", have: "0" });
  });
});
