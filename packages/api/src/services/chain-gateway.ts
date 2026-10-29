import { Keypair, type Horizon } from "@stellar/stellar-sdk";

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
  readEditionId,
  type Rates,
  submit,
} from "@bandcoin/chain/server";
import type { Db } from "@bandcoin/db";
import { AppError, ErrorCodes } from "@bandcoin/errors";
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
  /** Simulates a contract call and fills in its footprint and fee, ready to sign. `signers` are platform-held keys that authorise it (the price authority) */
  prepareContractCall(xdr: string, signers?: string[]): Promise<string>;
  /** The on-chain id of the edition registered under `editionRef`, or null when there is none */
  editionIdByRef(editionRef: string): Promise<number | null>;
  submit(xdr: string): Promise<{ hash: string }>;
  findTransaction(hash: string): Promise<{ successful: boolean; envelopeXdr: string } | null>;
  card: {
    charge(input: { orderId: string; sourceId: string; cents: number; verificationToken?: string }): Promise<{
      paymentId: string;
    }>;
    refund(input: { orderId: string; paymentId: string; cents: number }): Promise<void>;
  };
};

/**
 * The secrets for platform-held keys. The mother and treasury keys live in env,
 * and a secret only counts for the account it really belongs to, so a wrong
 * value can't sign for a different one. Everything else (issuers, storage) is
 * decrypted from the database.
 */
async function serverSecrets(db: Db, publicKeys: string[]): Promise<string[]> {
  const { mother, treasury } = chainConfig();
  const fromEnv = [
    { publicKey: mother, secret: process.env.MOTHER_SECRET },
    { publicKey: treasury, secret: process.env.TREASURY_SECRET },
  ].filter((entry) => entry.secret && entry.publicKey && Keypair.fromSecret(entry.secret).publicKey() === entry.publicKey);
  const stored = publicKeys.filter((key) => !fromEnv.some((entry) => entry.publicKey === key));
  const secrets = fromEnv.filter((entry) => publicKeys.includes(entry.publicKey!)).map((entry) => entry.secret!);
  if (stored.length > 0) {
    const accounts = await db.chainAccount.findMany({ where: { publicKey: { in: stored } }, select: { publicKey: true, secretEncrypted: true } });
    const missing = stored.filter((key) => !accounts.some((account) => account.publicKey === key));
    if (missing.length > 0) throw new AppError(ErrorCodes.STORAGE_ACCOUNT_UNAVAILABLE, { details: { missing } });
    secrets.push(...accounts.map((account) => decryptSecret(account.secretEncrypted)));
  }
  return secrets;
}

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
    signWithServerKeys: async (xdr, publicKeys) => {
      const secrets = await serverSecrets(db, publicKeys);
      return secrets.length === 0 ? xdr : addSignatures(xdr, secrets);
    },
    async signForCustodialUser(xdr, email) {
      return addSignatures(xdr, [await fetchCustodialAccountSecret(email)]);
    },
    prepareContractCall: async (xdr, signers = []) => prepareContractCall(xdr, await serverSecrets(db, signers)),
    submit,
    editionIdByRef: (editionRef) => readEditionId(chainConfig().nftContract, chainConfig().treasury, editionRef),
    findTransaction,
    card: { charge: chargeCard, refund: refundCard },
  };
}
