import { type Account, Operation } from "@stellar/stellar-sdk";

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
