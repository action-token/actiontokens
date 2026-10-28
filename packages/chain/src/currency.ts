import { Asset } from "@stellar/stellar-sdk";

/** Mirrors the `Currency` enum in @bandcoin/db. USD means a card payment. */
export const CURRENCIES = ["BANDCOIN", "XLM", "USDC", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];
export type OnChainCurrency = Exclude<Currency, "USD">;

export type AssetRef = { code: string; issuer: string };

/** The two credit assets payments use; XLM is native. */
export type PaymentAssets = { bandcoin: AssetRef; usdc: AssetRef };

export function assetFor(currency: OnChainCurrency, assets: PaymentAssets): Asset {
  if (currency === "XLM") return Asset.native();
  const { code, issuer } = currency === "BANDCOIN" ? assets.bandcoin : assets.usdc;
  return new Asset(code, issuer);
}

/**
 * Every kind of payment a user makes, and which currencies it accepts.
 * The rule: all four wherever the chain allows it.
 */
export type PaymentKind =
  | "ITEM_PURCHASE"
  | "FAN_TOKEN"
  | "GIFT"
  | "VANITY"
  | "STUDIO_COINS"
  | "BOUNTY_FUND"
  | "ROYALTY_PAYOUT";

/**
 * Currencies offered for a payment. A bounty's escrow holds one asset and a
 * royalty payout goes out in one asset, so those offer only the one picked.
 */
export function paymentOptions(kind: PaymentKind, fixed?: OnChainCurrency): Currency[] {
  if (kind === "BOUNTY_FUND" || kind === "ROYALTY_PAYOUT") {
    if (!fixed) throw new RangeError(`${kind} needs the asset it is paid in`);
    return [fixed];
  }
  return [...CURRENCIES];
}
