import { Asset, Keypair, type Horizon } from "@stellar/stellar-sdk";

import { signersNeeded } from "@bandcoin/chain";

import {
  addSignatures,
  chainConfig,
  type ChainConfig,
  assetExists,
  assetTomlUrl,
  decryptSecret,
  findTransaction,
  liveBandcoinUsd,
  liveRates,
  loadAccount,
  loadAssetHolders,
  claimableFor,
  type ClaimableToken,
  contractIsLive,
  prepareContractCall,
  readEditionId,
  readPurchaseReceipt,
  type NftPurchaseReceipt,
  readNftFeeSettings,
  type Rates,
  submit,
} from "@bandcoin/chain/server";
import type { EmailAccount } from "@bandcoin/auth/email-account";
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
  /** Every account holding an asset and how much; `complete` is false when there were too many to list */
  assetHolders(
    code: string,
    issuer: string,
  ): Promise<{ holders: { address: string; balance: string }[]; complete: boolean }>;
  /** Whether a contract exists at this address (an asset's contract only once it's set up) */
  contractIsLive(contract: string): Promise<boolean>;
  /** Tokens waiting for this account to claim (gifts) */
  claimableFor(address: string): Promise<ClaimableToken[]>;
  /** Whether an asset (code + issuer) exists on the network */
  assetExists(code: string, issuer: string): Promise<boolean>;
  /** The issuer's stellar.toml address for an asset, or null */
  assetTomlUrl(code: string, issuer: string): Promise<string | null>;
  /** The on-chain id of the edition registered under `editionRef`, or null when there is none */
  editionIdByRef(editionRef: string): Promise<number | null>;
  /** What `buy_edition` minted under this purchase ref (the order id), or null when nothing landed */
  nftPurchaseByRef(purchaseRef: string): Promise<NftPurchaseReceipt | null>;
  /** What the NFT contract enforces now: fee (basis points), treasury, owner */
  nftFeeSettings(): Promise<{ feeBps: number; treasury: string | null; owner: string | null }>;
  submit(xdr: string): Promise<{ hash: string }>;
  findTransaction(hash: string): Promise<{ successful: boolean; envelopeXdr: string } | null>;
  /**
   * The account for an email, made (Firebase user, custodial key, user row)
   * when there is none. Only for a gift being sent or a guest order whose
   * card was charged; quotes use `lookupAccountForEmail` (database only).
   */
  accountForEmail(email: string): Promise<EmailAccount>;
  card: {
    charge(input: {
      orderId: string;
      sourceId: string;
      cents: number;
      verificationToken?: string;
    }): Promise<{
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
  ].filter(
    (entry) =>
      entry.secret &&
      entry.publicKey &&
      Keypair.fromSecret(entry.secret).publicKey() === entry.publicKey,
  );
  const stored = publicKeys.filter((key) => !fromEnv.some((entry) => entry.publicKey === key));
  const secrets = fromEnv
    .filter((entry) => publicKeys.includes(entry.publicKey!))
    .map((entry) => entry.secret!);
  if (stored.length > 0) {
    const accounts = await db.chainAccount.findMany({
      where: { publicKey: { in: stored } },
      select: { publicKey: true, secretEncrypted: true },
    });
    const missing = stored.filter((key) => !accounts.some((account) => account.publicKey === key));
    if (missing.length > 0)
      throw new AppError(ErrorCodes.STORAGE_ACCOUNT_UNAVAILABLE, { details: { missing } });
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
      return liveBandcoinUsd({
        name: config.name,
        asset: config.assets.bandcoin,
        devPrice: process.env.BANDCOIN_USD_PRICE,
      });
    },
    signWithServerKeys: async (xdr, publicKeys) => {
      // Only keys this transaction needs: Stellar refuses an extra signature (tx_bad_auth_extra).
      const needed = signersNeeded(xdr, chainConfig().network.passphrase);
      const secrets = await serverSecrets(
        db,
        publicKeys.filter((key) => needed.has(key)),
      );
      return secrets.length === 0 ? xdr : addSignatures(xdr, secrets);
    },
    async signForCustodialUser(xdr, email) {
      return addSignatures(xdr, [await fetchCustodialAccountSecret(email)]);
    },
    prepareContractCall: async (xdr, signers = []) =>
      prepareContractCall(xdr, await serverSecrets(db, signers)),
    submit,
    contractIsLive,
    claimableFor,
    assetExists,
    assetTomlUrl,
    assetHolders: (code, issuer) => loadAssetHolders(new Asset(code, issuer)),
    editionIdByRef: (editionRef) =>
      readEditionId(chainConfig().nftContract, chainConfig().treasury, editionRef),
    nftPurchaseByRef: (purchaseRef) =>
      readPurchaseReceipt(chainConfig().nftContract, chainConfig().treasury, purchaseRef),
    nftFeeSettings: () => readNftFeeSettings(chainConfig().nftContract, chainConfig().treasury),
    findTransaction,
    async accountForEmail(email) {
      // Loaded on use: it pulls in Firebase, which the worker never needs.
      const { resolveAccountForEmail } = await import("@bandcoin/auth/email-account");
      return resolveAccountForEmail(db, email);
    },
    card: { charge: chargeCard, refund: refundCard },
  };
}
