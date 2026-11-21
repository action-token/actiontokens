import { Asset, type Horizon, Keypair } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";

import { availableOf, fundsOf, otherAssetsOf } from "../server/horizon";

const assets = {
  actionToken: { code: "ACTION", issuer: Keypair.random().publicKey() },
  usdc: { code: "USDC", issuer: Keypair.random().publicKey() },
};
const fanIssuer = Keypair.random().publicKey();

const account = {
  subentry_count: 3,
  balances: [
    { asset_type: "native", balance: "10", selling_liabilities: "1" },
    {
      asset_type: "credit_alphanum12",
      asset_code: "ACTION",
      asset_issuer: assets.actionToken.issuer,
      balance: "50",
      selling_liabilities: "0",
    },
    {
      asset_type: "credit_alphanum4",
      asset_code: "LUNA",
      asset_issuer: fanIssuer,
      balance: "20",
      selling_liabilities: "5",
    },
    {
      asset_type: "credit_alphanum4",
      asset_code: "EMPTY",
      asset_issuer: fanIssuer,
      balance: "3",
      selling_liabilities: "3",
    },
    { asset_type: "liquidity_pool_shares", liquidity_pool_id: "p", balance: "9" },
  ],
} as unknown as Horizon.AccountResponse;

describe("balances", () => {
  it("spends only what isn't locked in offers or reserves", () => {
    expect(availableOf(account, new Asset("LUNA", fanIssuer))).toBe("15.0000000");
    expect(availableOf(account, new Asset("NONE", fanIssuer))).toBe("0");
    expect(availableOf(account, Asset.native())).toBe("6.5000000");
    expect(availableOf(null, Asset.native())).toBe("0");
    expect(fundsOf(account, assets)).toEqual({
      ACTION: "50.0000000",
      XLM: "6.5000000",
      USDC: "0",
    });
  });

  it("lists the other tokens held, skipping the platform's, empty ones and pool shares", () => {
    expect(otherAssetsOf(account, assets)).toEqual([
      { code: "LUNA", issuer: fanIssuer, amount: "15.0000000" },
    ]);
    expect(otherAssetsOf(null, assets)).toEqual([]);
  });
});
