import { type Account, Asset, Operation } from "@stellar/stellar-sdk";

import type { AssetRef } from "../currency";

import { toAmount, toDisplay, toStroops } from "../money";
import type { RechargeLine, RechargeProblem } from "../recharge";
import { finish, type NetworkParams, startTransaction } from "../transaction";

/**
 * XLM the artist puts into their issuer account when opening it: the two base
 * reserves an account needs, plus room for the fees it pays when it mints.
 */
export const ISSUER_STARTING_XLM = "1.5";

/**
 * Opens an artist's issuer account, paid by the artist. One issuer per artist
 * (as in Wadzzo): their fan token and every item they create are issued by
 * it, so new items need no new account. The issuer stays unlocked so copies
 * can be minted when fans buy or claim; supply is enforced by the server.
 */
export function buildIssuerSetup(input: {
  artist: Account;
  network: NetworkParams;
  issuer: string;
  /** Shown by wallets and explorers next to the artist's tokens */
  homeDomain?: string;
}) {
  const builder = startTransaction(input.artist, input.network).addOperation(
    Operation.createAccount({ destination: input.issuer, startingBalance: ISSUER_STARTING_XLM }),
  );
  if (input.homeDomain) {
    builder.addOperation(
      Operation.setOptions({ source: input.issuer, homeDomain: input.homeDomain }),
    );
    return finish(builder, [input.issuer]);
  }
  return finish(builder);
}

/**
 * XLM the artist puts into their storage account: the reserves for the
 * account and its two trustlines (BANDCOIN and USDC), plus room for fees.
 */
export const STORAGE_STARTING_XLM = "2.5";

/**
 * Opens an artist's storage account, paid by the artist: a separate balance
 * that can pay bounty prizes. It trusts the payment assets (`trust`) so it can
 * hold them; those operations come from storage, so its key signs too.
 */
export function buildStorageSetup(input: {
  artist: Account;
  network: NetworkParams;
  storage: string;
  startingXlm?: string;
  trust?: AssetRef[];
}) {
  const builder = startTransaction(input.artist, input.network).addOperation(
    Operation.createAccount({
      destination: input.storage,
      startingBalance: input.startingXlm ?? STORAGE_STARTING_XLM,
    }),
  );
  for (const asset of input.trust ?? [])
    builder.addOperation(
      Operation.changeTrust({
        source: input.storage,
        asset: new Asset(asset.code, asset.issuer),
      }),
    );
  return input.trust?.length ? finish(builder, [input.storage]) : finish(builder);
}

/**
 * The price of opening an account the artist pays for (issuer or storage):
 * the starting XLM and the network fee, checked against their spendable XLM.
 */
export function quoteAccountSetup(input: {
  xlmFunds: string | null;
  networkFeeXlm: string;
  startingXlm: string;
  /** What the line says, e.g. "Open your artist account" */
  label: string;
  /** Ends "You need 1 more XLM to …" */
  purpose: string;
}) {
  const opening = toStroops(input.startingXlm);
  const fee = toStroops(input.networkFeeXlm);
  const total = opening + fee;
  const problems: RechargeProblem[] = [];
  if (input.xlmFunds === null) problems.push({ code: "SIGN_IN", message: "Sign in to pay." });
  else {
    const have = toStroops(input.xlmFunds);
    if (have < total) {
      problems.push({
        code: "INSUFFICIENT_FUNDS",
        message: `You need ${toDisplay(total - have)} more XLM to ${input.purpose}.`,
        shortfall: {
          currency: "XLM",
          need: toDisplay(total),
          have: toDisplay(have),
          short: toDisplay(total - have),
        },
      });
    }
  }
  return {
    ok: problems.length === 0,
    problems,
    total: toAmount(total),
    lines: [
      { key: "account", label: input.label, currency: "XLM", amount: toDisplay(opening) },
      { key: "networkFee", label: "Network fee", currency: "XLM", amount: toDisplay(fee) },
      { key: "total", label: "You pay", currency: "XLM", amount: toDisplay(total) },
    ] satisfies RechargeLine[],
  };
}

/** The price of opening an issuer, for the apply screen and Settings. */
export const quoteIssuerSetup = (input: { xlmFunds: string | null; networkFeeXlm: string }) =>
  quoteAccountSetup({
    ...input,
    startingXlm: ISSUER_STARTING_XLM,
    label: "Open your artist account",
    purpose: "open your artist account",
  });

/** The price of opening a storage account, for Settings. */
export const quoteStorageSetup = (input: { xlmFunds: string | null; networkFeeXlm: string }) =>
  quoteAccountSetup({
    ...input,
    startingXlm: STORAGE_STARTING_XLM,
    label: "Open your storage account",
    purpose: "open your storage account",
  });

/**
 * Gives an artist their XLM back when their application is rejected: the
 * issuer account closes into the artist's wallet. Only an issuer that never
 * minted anything can do this (no trustlines or offers), which is true
 * before approval. The issuer signs; the fee comes out of its own balance.
 */
export function buildIssuerRefund(input: {
  issuer: Account;
  network: NetworkParams;
  artist: string;
}) {
  const builder = startTransaction(input.issuer, input.network).addOperation(
    Operation.accountMerge({ destination: input.artist }),
  );
  return finish(builder, [input.issuer.accountId()]);
}
