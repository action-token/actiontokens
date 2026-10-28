import { type Asset, Horizon, Keypair, NotFoundError, TransactionBuilder } from "@stellar/stellar-sdk";

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

const line = (account: Horizon.AccountResponse, asset: Asset) =>
  account.balances.find(
    (balance) =>
      "asset_code" in balance && balance.asset_code === asset.getCode() && balance.asset_issuer === asset.getIssuer(),
  );

export const trusts = (account: Horizon.AccountResponse, asset: Asset) => asset.isNative() || Boolean(line(account, asset));

/** XLM the account can spend: balance − reserves − XLM locked in offers. */
export function spendableXlm(account: Horizon.AccountResponse): string {
  const native = account.balances.find((balance) => balance.asset_type === "native");
  const { num_sponsoring = 0, num_sponsored = 0 } = account as unknown as { num_sponsoring?: number; num_sponsored?: number };
  const entries = BigInt(2 + account.subentry_count + num_sponsoring - num_sponsored);
  const locked = entries * BASE_RESERVE_STROOPS + toStroops(native?.selling_liabilities ?? "0");
  const spendable = toStroops(native?.balance ?? "0") - locked;
  return toAmount(spendable > 0n ? spendable : 0n);
}

/** What a buyer can pay with, per currency (0 for an asset without a trustline). */
export function fundsOf(account: Horizon.AccountResponse | null, assets: PaymentAssets): Record<OnChainCurrency, string> {
  if (!account) return { BANDCOIN: "0", XLM: "0", USDC: "0" };
  const balanceOf = (ref: { code: string; issuer: string }) => {
    const found = account.balances.find(
      (balance) => "asset_code" in balance && balance.asset_code === ref.code && balance.asset_issuer === ref.issuer,
    );
    if (!found) return "0";
    const available = toStroops(found.balance) - toStroops("selling_liabilities" in found ? found.selling_liabilities : "0");
    return toAmount(available > 0n ? available : 0n);
  };
  return { BANDCOIN: balanceOf(assets.bandcoin), XLM: spendableXlm(account), USDC: balanceOf(assets.usdc) };
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
    throw toStellarError(error);
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
