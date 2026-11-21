import { Asset } from "@stellar/stellar-sdk";
import { AppError, isEnvValidationSkipped } from "@actiontokens/errors";

/**
 * The token this deployment's platform runs on, and the fees charged in it.
 * Read from literal `process.env.NEXT_PUBLIC_*` so browser bundles get them.
 */
const assetCode = process.env.NEXT_PUBLIC_ASSET_CODE;
const assetIssuer = process.env.NEXT_PUBLIC_ASSET_ISSUER;
const stage = process.env.NEXT_PUBLIC_STAGE;

function createPlatformAsset(): Asset & { issuer: string } {
  if (!assetCode || !assetIssuer) {
    // Builds that skip env validation have no token; they never move money.
    if (isEnvValidationSkipped()) return Asset.native() as Asset & { issuer: string };
    throw new AppError("CONFIG_MISSING", {
      message: "Set NEXT_PUBLIC_ASSET_CODE and NEXT_PUBLIC_ASSET_ISSUER.",
      details: { name: "NEXT_PUBLIC_ASSET_CODE / NEXT_PUBLIC_ASSET_ISSUER" },
    });
  }
  // Never the native asset, so `issuer` is always set (newer SDKs type it `string | undefined`).
  return new Asset(assetCode, assetIssuer) as Asset & { issuer: string };
}

export const PLATFORM_ASSET = createPlatformAsset();

const isProductionStage = stage === "prod";

/** Base fee (stroops) for a transaction. */
export const TrxBaseFee = isProductionStage ? "1000" : "100";

/**
 * What a Stellar transaction costs, paid in ACTION (same on every stage, as in bandfan).
 * Moves to AppSetting (server-priced) in phase 3.
 */
export const TrxBaseFeeInPlatformAsset = "1400";

/** Flat platform fee, paid in ACTION. Moves to AppSetting in phase 3. */
export const PLATFORM_FEE = "6000";
