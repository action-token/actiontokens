import type { Horizon } from "@stellar/stellar-sdk";

import {
  addSignatures,
  chainConfig,
  type ChainConfig,
  decryptSecret,
  findTransaction,
  liveBandcoinUsd,
  liveRates,
  loadAccount,
  prepareContractCall,
  type Rates,
  submit,
} from "@bandcoin/chain/server";
import type { Db } from "@bandcoin/db";
import { AppError, ErrorCodes, requireEnv } from "@bandcoin/errors";
import { fetchCustodialAccountSecret } from "@bandcoin/wallet/server";

import { chargeCard, refundCard } from "../payments/square";

/**
 * Everything services need from the outside world: Stellar, keys and the
 * card processor. Services take it from `ctx.chain`, so tests pass a fake and
 * never touch the network.
 */
export type ChainGateway = {
  config: ChainConfig;
  loadAccount(id: string): Promise<Horizon.AccountResponse | null>;
  rates(): Promise<Rates>;
  /** USD per BANDCOIN: the market price, or BANDCOIN_USD_PRICE on testnet */
  bandcoinUsd(): Promise<string>;
  /** Signs with the platform-held keys (issuer, storage) the builder listed */
  signWithServerKeys(xdr: string, publicKeys: string[]): Promise<string>;
  /** Signs for an email/Google/Apple account, whose key the platform keeps */
  signForCustodialUser(xdr: string, email: string): Promise<string>;
  /** Simulates a contract call and fills in its footprint and fee, ready to sign */
  prepareContractCall(xdr: string): Promise<string>;
  submit(xdr: string): Promise<{ hash: string }>;
  findTransaction(hash: string): Promise<{ successful: boolean; envelopeXdr: string } | null>;
  card: {
    charge(input: { orderId: string; sourceId: string; cents: number; verificationToken?: string }): Promise<{
      paymentId: string;
    }>;
    refund(input: { orderId: string; paymentId: string; cents: number }): Promise<void>;
  };
};

/** The real gateway: Horizon, the encrypted ChainAccount keys, the accounts service and Square. */
export function createChainGateway(db: Db): ChainGateway {
  return {
    config: chainConfig(),
    loadAccount,
    rates: () => liveRates(),
    bandcoinUsd() {
      const config = chainConfig();
      return liveBandcoinUsd({ name: config.name, asset: config.assets.bandcoin, devPrice: process.env.BANDCOIN_USD_PRICE });
    },
    async signWithServerKeys(xdr, publicKeys) {
      // The mother account's key lives in env, not in the database.
      const { mother } = chainConfig();
      const stored = publicKeys.filter((key) => key !== mother);
      const secrets = publicKeys.length > stored.length ? [requireEnv("MOTHER_SECRET", process.env.MOTHER_SECRET)] : [];
      if (stored.length > 0) {
        const accounts = await db.chainAccount.findMany({
          where: { publicKey: { in: stored } },
          select: { publicKey: true, secretEncrypted: true },
        });
        const missing = stored.filter((key) => !accounts.some((account) => account.publicKey === key));
        if (missing.length > 0) {
          throw new AppError(ErrorCodes.STORAGE_ACCOUNT_UNAVAILABLE, { details: { missing } });
        }
        secrets.push(...accounts.map((account) => decryptSecret(account.secretEncrypted)));
      }
      return secrets.length === 0 ? xdr : addSignatures(xdr, secrets);
    },
    async signForCustodialUser(xdr, email) {
      return addSignatures(xdr, [await fetchCustodialAccountSecret(email)]);
    },
    prepareContractCall: (xdr) => prepareContractCall(xdr),
    submit,
    findTransaction,
    card: { charge: chargeCard, refund: refundCard },
  };
}
