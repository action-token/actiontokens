import { Asset } from "@stellar/stellar-sdk";

import { assetFor, tokenAddressOf } from "@actiontokens/chain";
import type { ChainConfig } from "@actiontokens/chain/server";
import type { Currency } from "@actiontokens/db";

import type { ChainGateway } from "../chain-gateway";

/**
 * What a bounty's prize is paid in. Either one of the platform's currencies
 * (ACTION, XLM, USDC: `prizeCurrency`) or any other classic asset the
 * artist holds, such as their fan token (`prizeAssetCode` + `prizeAssetIssuer`),
 * as on the old Action Tokens. The database keeps exactly one of the two.
 */
export type PrizeFields = {
  prizeCurrency: Currency | null;
  prizeAssetCode: string | null;
  prizeAssetIssuer: string | null;
};

export const PRIZE_CURRENCIES = ["ACTION", "XLM", "USDC"] as const;
export type PrizeCurrency = (typeof PRIZE_CURRENCIES)[number];

/** The Stellar asset the escrow holds for this bounty. */
export function prizeAsset(bounty: PrizeFields, assets: ChainConfig["assets"]): Asset {
  if (bounty.prizeAssetCode && bounty.prizeAssetIssuer)
    return new Asset(bounty.prizeAssetCode, bounty.prizeAssetIssuer);
  return assetFor((bounty.prizeCurrency ?? "ACTION") as PrizeCurrency, assets);
}

/** The prize for screens: a platform currency (shown with its icon) or another asset's code. */
export function prizeView(
  bounty: PrizeFields & { prizeAmount: { toString(): string } },
  config: Pick<ChainConfig, "assets" | "name">,
) {
  const network = config.name === "mainnet" ? "public" : "testnet";
  const asset = prizeAsset(bounty, config.assets);
  const currency = bounty.prizeAssetCode
    ? null
    : ((bounty.prizeCurrency ?? "ACTION") as PrizeCurrency);
  return {
    amount: bounty.prizeAmount.toString(),
    /** Null when the prize is another asset: show `code` instead */
    currency,
    code: currency ?? asset.getCode(),
    explorerUrl: `https://stellar.expert/explorer/${network}/asset/${
      asset.isNative() ? "XLM" : `${asset.getCode()}-${asset.getIssuer()}`
    }`,
  };
}

/**
 * Turns the form's choice into what's stored. An "other asset" that is really
 * ACTION or USDC is stored as that currency.
 */
export function prizeFieldsFor(
  choice: { currency?: PrizeCurrency; asset?: { code: string; issuer: string } },
  assets: ChainConfig["assets"],
): PrizeFields | null {
  if (choice.currency && !choice.asset)
    return { prizeCurrency: choice.currency, prizeAssetCode: null, prizeAssetIssuer: null };
  if (!choice.asset || choice.currency) return null;
  const { code, issuer } = choice.asset;
  for (const [currency, known] of [
    ["ACTION", assets.actionToken],
    ["USDC", assets.usdc],
  ] as const)
    if (known.code === code && known.issuer === issuer)
      return { prizeCurrency: currency, prizeAssetCode: null, prizeAssetIssuer: null };
  return { prizeCurrency: null, prizeAssetCode: code, prizeAssetIssuer: issuer };
}

/** The prize's asset and the token address the escrow is given for it. */
export function prizeToken(config: Pick<ChainConfig, "assets" | "network">, bounty: PrizeFields) {
  const asset = prizeAsset(bounty, config.assets);
  return { asset, address: tokenAddressOf(asset, config.network.passphrase) };
}

/**
 * Whether the prize's asset still needs its Stellar Asset Contract deployed
 * before it can be escrowed. XLM, ACTION and USDC are always ready.
 */
export async function needsTokenSetup(
  chain: Pick<ChainGateway, "config" | "contractIsLive">,
  bounty: PrizeFields,
) {
  if (!bounty.prizeAssetCode) return false;
  return !(await chain.contractIsLive(prizeToken(chain.config, bounty).address));
}
