import { type Account, type Asset, Claimant, Operation } from "@stellar/stellar-sdk";

import { MAX_OPERATIONS_PER_TX } from "../royalty/payout";
import {
  type BuiltTransaction,
  finish,
  type NetworkParams,
  startTransaction,
} from "../transaction";

export { MAX_OPERATIONS_PER_TX };

/** One holder's reward. `claimable`: they have no trustline yet, so it waits for them to claim it. */
export type RewardLine = { to: string; amount: string; claimable: boolean };

/**
 * One transaction paying up to 100 holders, sent from the platform's own account. A holder without
 * a trustline gets a claimable balance instead, so one missing trustline never fails the batch.
 * The memo carries the round's id, so a payment is traceable to its round on the explorer.
 */
export function buildRewardBatch(input: {
  payer: Account;
  network: NetworkParams;
  asset: Asset;
  lines: RewardLine[];
  memo: string;
  /** Short: the sender checks a batch's outcome once this has passed (see services/rewards) */
  timeoutSeconds: number;
}): BuiltTransaction {
  if (input.lines.length === 0 || input.lines.length > MAX_OPERATIONS_PER_TX)
    throw new RangeError(`A reward batch holds 1–${MAX_OPERATIONS_PER_TX} payments`);
  const builder = startTransaction(input.payer, input.network, {
    memo: input.memo,
    timeoutSeconds: input.timeoutSeconds,
  });
  for (const line of input.lines)
    builder.addOperation(
      line.claimable
        ? Operation.createClaimableBalance({
            asset: input.asset,
            amount: line.amount,
            claimants: [new Claimant(line.to, Claimant.predicateUnconditional())],
          })
        : Operation.payment({ destination: line.to, asset: input.asset, amount: line.amount }),
    );
  return finish(builder);
}
