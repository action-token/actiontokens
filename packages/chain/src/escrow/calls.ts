import { type Account, type Asset, Operation } from "@stellar/stellar-sdk";

import { arg, buildContractCall } from "../soroban";
import { finish, type NetworkParams, startTransaction } from "../transaction";

/**
 * Calls on the `bounty_escrow` contract. The escrow holds one asset per
 * bounty, so a bounty is funded in the one currency the artist picked.
 *
 * Bounties are the one place the platform may pay network fees: `source` can
 * be the platform account (e.g. so a winner with no XLM can still claim), as
 * long as the required party authorises the call.
 */

type Common = { source: Account; network: NetworkParams; contract: string };

/** The artist deposits the prize. Only the artist signs. */
export function buildBountyFund(
  input: Common & {
    bountyId: string;
    creator: string;
    token: string;
    amount: bigint;
    maxWinners: number;
  },
) {
  return buildContractCall({
    ...input,
    method: "create_bounty",
    args: [
      arg.string(input.bountyId),
      arg.address(input.creator),
      arg.address(input.token),
      arg.i128(input.amount),
      arg.u32(input.maxWinners),
    ],
  });
}

/** The artist commits part of the escrow to a winner. */
export function buildBountySelectWinner(
  input: Common & { bountyId: string; caller: string; winner: string; amount: bigint },
) {
  return buildContractCall({
    ...input,
    method: "select_winner",
    args: [
      arg.address(input.caller),
      arg.string(input.bountyId),
      arg.address(input.winner),
      arg.i128(input.amount),
    ],
  });
}

/** The winner pulls their award. */
export function buildBountyClaim(input: Common & { bountyId: string; winner: string }) {
  return buildContractCall({
    ...input,
    method: "claim_reward",
    args: [arg.string(input.bountyId), arg.address(input.winner)],
  });
}

/** The artist cancels and gets the unawarded remainder back. */
export function buildBountyCancel(input: Common & { bountyId: string; caller: string }) {
  return buildContractCall({
    ...input,
    method: "cancel_bounty",
    args: [arg.address(input.caller), arg.string(input.bountyId)],
  });
}

/**
 * Sets up a classic asset's Stellar Asset Contract, so the escrow can hold it
 * (the artist's fan token, say). Needed once per asset, ever; anyone may do
 * it. The artist is the source and pays the fee. Prepare it with
 * `prepareContractCall` like any contract call.
 */
export function buildAssetContractSetup(input: {
  source: Account;
  network: NetworkParams;
  asset: Asset;
}) {
  const builder = startTransaction(input.source, input.network).addOperation(
    Operation.createStellarAssetContract({ asset: input.asset }),
  );
  return finish(builder);
}
