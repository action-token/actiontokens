import { type Account, type Asset, Operation } from "@stellar/stellar-sdk";

import { isZero } from "../classic/purchase";
import {
  type BuiltTransaction,
  finish,
  type NetworkParams,
  startTransaction,
} from "../transaction";

/** Stellar's limit on operations in one transaction. */
export const MAX_OPERATIONS_PER_TX = 100;

/**
 * Pays royalty holders in batches of up to 100 payments, paid by the artist.
 * The transactions use consecutive sequence numbers, so they must be
 * submitted in the order returned.
 */
export function buildRoyaltyPayouts(input: {
  payer: Account;
  network: NetworkParams;
  asset: Asset;
  lines: { to: string; amount: string }[];
  /** Payout id, in every batch's memo */
  payoutId: string;
}): BuiltTransaction[] {
  const lines = input.lines.filter((line) => !isZero(line.amount));
  const batches: BuiltTransaction[] = [];

  for (let start = 0; start < lines.length; start += MAX_OPERATIONS_PER_TX) {
    // build() bumps the account's sequence, so each batch follows the last.
    const builder = startTransaction(input.payer, input.network, { memo: input.payoutId });
    for (const line of lines.slice(start, start + MAX_OPERATIONS_PER_TX)) {
      builder.addOperation(
        Operation.payment({ destination: line.to, asset: input.asset, amount: line.amount }),
      );
    }
    batches.push(finish(builder));
  }
  return batches;
}
