import { type Account, Operation } from "@stellar/stellar-sdk";

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
    builder.addOperation(Operation.setOptions({ source: input.issuer, homeDomain: input.homeDomain }));
    return finish(builder, [input.issuer]);
  }
  return finish(builder);
}

/**
 * Opens an artist's storage account (holds copies minted ahead of sale), paid
 * by the artist.
 */
export function buildStorageSetup(input: {
  artist: Account;
  network: NetworkParams;
  storage: string;
  startingXlm: string;
}) {
  const builder = startTransaction(input.artist, input.network).addOperation(
    Operation.createAccount({ destination: input.storage, startingBalance: input.startingXlm }),
  );
  return finish(builder);
}

/**
 * The price of opening an issuer, for the apply screen: the starting XLM and
 * the network fee, both paid by the artist, checked against their spendable XLM.
 */
export function quoteIssuerSetup(input: { xlmFunds: string | null; networkFeeXlm: string }) {
  const issuer = toStroops(ISSUER_STARTING_XLM);
  const fee = toStroops(input.networkFeeXlm);
  const total = issuer + fee;
  const problems: RechargeProblem[] = [];
  if (input.xlmFunds === null) problems.push({ code: "SIGN_IN", message: "Sign in to pay." });
  else {
    const have = toStroops(input.xlmFunds);
    if (have < total) {
      problems.push({
        code: "INSUFFICIENT_FUNDS",
        message: `You need ${toDisplay(total - have)} more XLM to open your artist account.`,
        shortfall: { currency: "XLM", need: toDisplay(total), have: toDisplay(have), short: toDisplay(total - have) },
      });
    }
  }
  return {
    ok: problems.length === 0,
    problems,
    total: toAmount(total),
    lines: [
      { key: "issuer", label: "Open your artist account", currency: "XLM", amount: toDisplay(issuer) },
      { key: "networkFee", label: "Network fee", currency: "XLM", amount: toDisplay(fee) },
      { key: "total", label: "You pay", currency: "XLM", amount: toDisplay(total) },
    ] satisfies RechargeLine[],
  };
}

/**
 * Gives an artist their XLM back when their application is rejected: the
 * issuer account closes into the artist's wallet. Only an issuer that never
 * minted anything can do this (no trustlines or offers), which is true
 * before approval. The issuer signs; the fee comes out of its own balance.
 */
export function buildIssuerRefund(input: { issuer: Account; network: NetworkParams; artist: string }) {
  const builder = startTransaction(input.issuer, input.network).addOperation(
    Operation.accountMerge({ destination: input.artist }),
  );
  return finish(builder, [input.issuer.accountId()]);
}
