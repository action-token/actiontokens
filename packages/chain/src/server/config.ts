import { Keypair, Networks } from "@stellar/stellar-sdk";

import { AppError, ErrorCodes, isEnvValidationSkipped, requireEnv } from "@bandcoin/errors";

import type { PaymentAssets } from "../currency";
import type { NetworkParams } from "../transaction";

/** Circle's USDC issuers. */
const USDC_ISSUER = {
  mainnet: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
  testnet: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
} as const;

const DEFAULTS = {
  mainnet: {
    passphrase: Networks.PUBLIC,
    horizonUrl: "https://horizon.stellar.org",
    rpcUrl: "https://mainnet.sorobanrpc.com",
    baseFee: "1000",
  },
  testnet: {
    passphrase: Networks.TESTNET,
    horizonUrl: "https://horizon-testnet.stellar.org",
    rpcUrl: "https://soroban-testnet.stellar.org",
    baseFee: "100",
  },
} as const;

export type ChainConfig = {
  name: "mainnet" | "testnet";
  network: NetworkParams;
  horizonUrl: string;
  rpcUrl: string;
  assets: PaymentAssets;
  /** Where platform fees go, unless AppSetting.platformFeeRecipient overrides it */
  treasury: string;
  /** Public key of the platform's mother account (MOTHER_SECRET), which sends top-up BANDCOIN and XLM; null without the key */
  mother: string | null;
  nftContract: string | null;
  escrowContract: string | null;
};

let cached: ChainConfig | null = null;

/**
 * Chain settings from the environment, read once. Builders never call this;
 * services do and pass the values in.
 *
 *   NEXT_PUBLIC_STELLAR_NETWORK   testnet | mainnet
 *   NEXT_PUBLIC_ASSET_CODE/ISSUER the BANDCOIN asset
 *   NEXT_PUBLIC_USDC_ISSUER       optional, defaults to Circle's
 *   PLATFORM_TREASURY             public key that receives platform fees
 *   MOTHER_SECRET                 optional here; recharge sends from this account
 *   STELLAR_BASE_FEE, SOROBAN_RPC_URL, HORIZON_URL, NFT_CONTRACT, ESCROW_CONTRACT  optional
 */
export function chainConfig(env: Record<string, string | undefined> = process.env): ChainConfig {
  if (cached && env === process.env) return cached;

  const name =
    env.NEXT_PUBLIC_STELLAR_NETWORK ?? (isEnvValidationSkipped() ? "testnet" : undefined);
  if (name !== "mainnet" && name !== "testnet") {
    throw new AppError(ErrorCodes.CONFIG_MISSING, {
      message: 'Set NEXT_PUBLIC_STELLAR_NETWORK to "testnet" or "mainnet".',
      details: { name: "NEXT_PUBLIC_STELLAR_NETWORK" },
    });
  }
  const defaults = DEFAULTS[name];
  const config: ChainConfig = {
    name,
    network: { passphrase: defaults.passphrase, baseFee: env.STELLAR_BASE_FEE ?? defaults.baseFee },
    horizonUrl: env.HORIZON_URL ?? defaults.horizonUrl,
    rpcUrl: env.SOROBAN_RPC_URL ?? defaults.rpcUrl,
    assets: {
      bandcoin: {
        code: requireEnv("NEXT_PUBLIC_ASSET_CODE", env.NEXT_PUBLIC_ASSET_CODE),
        issuer: requireEnv("NEXT_PUBLIC_ASSET_ISSUER", env.NEXT_PUBLIC_ASSET_ISSUER),
      },
      usdc: { code: "USDC", issuer: env.NEXT_PUBLIC_USDC_ISSUER ?? USDC_ISSUER[name] },
    },
    treasury: requireEnv("PLATFORM_TREASURY", env.PLATFORM_TREASURY),
    mother: env.MOTHER_SECRET ? Keypair.fromSecret(env.MOTHER_SECRET).publicKey() : null,
    nftContract: env.NFT_CONTRACT ?? null,
    escrowContract: env.ESCROW_CONTRACT ?? null,
  };
  if (env === process.env) cached = config;
  return config;
}
