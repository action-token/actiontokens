import {
  type Asset,
  Horizon,
  Keypair,
  NotFoundError,
  TransactionBuilder,
} from "@stellar/stellar-sdk";

import type { OnChainCurrency, PaymentAssets } from "../currency";
import { toStellarError } from "../errors";
import { toAmount, toStroops } from "../money";
import { chainConfig } from "./config";

const BASE_RESERVE_STROOPS = 5_000_000n;

let server: Horizon.Server | null = null;
export const horizon = () => (server ??= new Horizon.Server(chainConfig().horizonUrl));

/** The account, or null when it isn't on-chain yet. */
export async function loadAccount(id: string): Promise<Horizon.AccountResponse | null> {
  try {
    return await horizon().loadAccount(id);
  } catch (error) {
    if (error instanceof NotFoundError) return null;
    throw error;
  }
}

/** Whether an asset exists on the network, so a fan token can point at one the artist already issued. */
export async function assetExists(code: string, issuer: string): Promise<boolean> {
  const page = await horizon().assets().forCode(code).forIssuer(issuer).limit(1).call();
  return page.records.length > 0;
}

/** Where the asset's issuer publishes its stellar.toml (from its home domain), or null. */
export async function assetTomlUrl(code: string, issuer: string): Promise<string | null> {
  const page = await horizon().assets().forCode(code).forIssuer(issuer).limit(1).call();
  const href = (page.records[0] as { _links?: { toml?: { href?: string } } } | undefined)?._links
    ?.toml?.href;
  return href?.startsWith("https://") ? href : null;
}

const lineOf = (account: Horizon.AccountResponse, code: string, issuer: string) =>
  account.balances.find(
    (balance) =>
      "asset_code" in balance && balance.asset_code === code && balance.asset_issuer === issuer,
  );
const line = (account: Horizon.AccountResponse, asset: Asset) =>
  lineOf(account, asset.getCode(), asset.getIssuer() ?? "");

export const trusts = (account: Horizon.AccountResponse, asset: Asset) =>
  asset.isNative() || Boolean(line(account, asset));

const HOLDERS_PER_PAGE = 200;
/** A token with more holders than this isn't paid out in one go; the quote says so. */
export const MAX_HOLDER_PAGES = 25;

/** Every account holding an asset and how much, in pages of 200 (`complete` is false past the cap). */
export async function loadAssetHolders(
  asset: Asset,
  maxPages = MAX_HOLDER_PAGES,
): Promise<{ holders: { address: string; balance: string }[]; complete: boolean }> {
  const holders: { address: string; balance: string }[] = [];
  let page = await horizon().accounts().forAsset(asset).limit(HOLDERS_PER_PAGE).call();
  for (let count = 1; ; count++) {
    for (const account of page.records) {
      const held = line(account as unknown as Horizon.AccountResponse, asset);
      if (held && toStroops(held.balance) > 0n)
        holders.push({ address: account.account_id, balance: held.balance });
    }
    if (page.records.length < HOLDERS_PER_PAGE) return { holders, complete: true };
    if (count >= maxPages) return { holders, complete: false };
    page = await page.next();
  }
}

/**
 * Every account with a trustline to an asset, whatever it holds (even nothing), in pages of 200
 * (`complete` is false past the cap). Who "trusts" the asset, as opposed to who holds some of it.
 */
export async function loadAssetTrustees(
  asset: Asset,
  maxPages = MAX_HOLDER_PAGES,
): Promise<{ addresses: string[]; complete: boolean }> {
  const addresses: string[] = [];
  let page = await horizon().accounts().forAsset(asset).limit(HOLDERS_PER_PAGE).call();
  for (let count = 1; ; count++) {
    for (const account of page.records) addresses.push(account.account_id);
    if (page.records.length < HOLDERS_PER_PAGE) return { addresses, complete: true };
    if (count >= maxPages) return { addresses, complete: false };
    page = await page.next();
  }
}

/** XLM the account can spend: balance − reserves − XLM locked in offers. */
export function spendableXlm(account: Horizon.AccountResponse): string {
  const native = account.balances.find((balance) => balance.asset_type === "native");
  const { num_sponsoring = 0, num_sponsored = 0 } = account as unknown as {
    num_sponsoring?: number;
    num_sponsored?: number;
  };
  const entries = BigInt(2 + account.subentry_count + num_sponsoring - num_sponsored);
  const locked = entries * BASE_RESERVE_STROOPS + toStroops(native?.selling_liabilities ?? "0");
  const spendable = toStroops(native?.balance ?? "0") - locked;
  return toAmount(spendable > 0n ? spendable : 0n);
}

type Line = Horizon.HorizonApi.BalanceLine;

const available = (found: Line) => {
  const left =
    toStroops(found.balance) -
    toStroops("selling_liabilities" in found ? found.selling_liabilities : "0");
  return toAmount(left > 0n ? left : 0n);
};

/** How much of an asset the account can spend ("0" without a trustline). */
export function availableOf(account: Horizon.AccountResponse | null, asset: Asset): string {
  if (!account) return "0";
  if (asset.isNative()) return spendableXlm(account);
  const found = line(account, asset);
  return found ? available(found) : "0";
}

/** What a buyer can pay with, per currency (0 for an asset without a trustline). */
export function fundsOf(
  account: Horizon.AccountResponse | null,
  assets: PaymentAssets,
): Record<OnChainCurrency, string> {
  const of = (ref: { code: string; issuer: string }) => {
    const found = account && lineOf(account, ref.code, ref.issuer);
    return found ? available(found) : "0";
  };
  return {
    ACTION: of(assets.actionToken),
    XLM: account ? spendableXlm(account) : "0",
    USDC: of(assets.usdc),
  };
}

/** Every other classic asset the account holds (not XLM, ACTION or USDC), with what's spendable. */
export function otherAssetsOf(
  account: Horizon.AccountResponse | null,
  assets: PaymentAssets,
): { code: string; issuer: string; amount: string }[] {
  if (!account) return [];
  const known = [assets.actionToken, assets.usdc];
  return account.balances.flatMap((balance) => {
    if (balance.asset_type !== "credit_alphanum4" && balance.asset_type !== "credit_alphanum12")
      return [];
    const { asset_code: code, asset_issuer: issuer } = balance;
    if (known.some((ref) => ref.code === code && ref.issuer === issuer)) return [];
    const amount = available(balance);
    return toStroops(amount) > 0n ? [{ code, issuer, amount }] : [];
  });
}

/** A token waiting to be claimed by an account (a gift), as Horizon lists it. */
export type ClaimableToken = {
  id: string;
  code: string;
  issuer: string;
  amount: string;
  /** The account that made the balance (the sender) */
  sponsor: string;
  /** Everyone who can claim it: the receiver, and the sender who can take it back */
  claimants: string[];
};

/** Claimable balances the account can accept now: tokens only (not XLM), up to 50. */
export async function claimableFor(address: string): Promise<ClaimableToken[]> {
  const page = await horizon().claimableBalances().claimant(address).limit(50).call();
  return page.records.flatMap((record) => {
    const [code, issuer] = record.asset.split(":");
    const unconditional = record.claimants.some(
      (claimant) =>
        claimant.destination === address &&
        "unconditional" in claimant.predicate &&
        claimant.predicate.unconditional === true,
    );
    if (!code || !issuer || !unconditional) return [];
    return [
      {
        id: record.id,
        code,
        issuer,
        amount: record.amount,
        sponsor: record.sponsor ?? "",
        claimants: record.claimants.map((claimant) => claimant.destination),
      },
    ];
  });
}

/** Adds the server's signatures to a transaction the user already signed. */
export function addSignatures(xdr: string, secrets: string[]): string {
  const tx = TransactionBuilder.fromXDR(xdr, chainConfig().network.passphrase);
  for (const secret of secrets) tx.sign(Keypair.fromSecret(secret));
  return tx.toXDR();
}

/** Submits a signed transaction; Stellar rejections become AppErrors with plain messages. */
export async function submit(xdr: string): Promise<{ hash: string }> {
  const tx = TransactionBuilder.fromXDR(xdr, chainConfig().network.passphrase);
  try {
    const result = await horizon().submitTransaction(tx);
    return { hash: result.hash };
  } catch (error) {
    const failure = toStellarError(error);
    // The exact codes are what tell a rejection apart; keep them in the server log.
    console.warn("[stellar] submit failed", failure.code, JSON.stringify(failure.details ?? null));
    throw failure;
  }
}

/** A submitted transaction's envelope, or null if Horizon hasn't seen it. */
export async function findTransaction(hash: string) {
  try {
    const tx = await horizon().transactions().transaction(hash).call();
    return { successful: tx.successful, envelopeXdr: tx.envelope_xdr, ledgerAt: tx.created_at };
  } catch (error) {
    if (error instanceof NotFoundError) return null;
    throw error;
  }
}
