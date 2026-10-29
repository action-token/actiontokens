import { type Account, type Asset, Claimant, Operation } from "@stellar/stellar-sdk";

import { finish, type NetworkParams, startTransaction } from "../transaction";

/**
 * Sends an item or a token from the user to someone else, paid by the sender.
 * If the receiver can't hold the asset yet, it becomes a claimable balance
 * they accept later (the sender can take it back until then).
 */
export function buildTransfer(input: {
  sender: Account;
  network: NetworkParams;
  to: string;
  asset: Asset;
  amount: string;
  receiverTrusts: boolean;
  memo?: string;
}) {
  const sender = input.sender.accountId();
  const builder = startTransaction(input.sender, input.network, { memo: input.memo });

  if (input.receiverTrusts || input.asset.isNative()) {
    builder.addOperation(Operation.payment({ destination: input.to, asset: input.asset, amount: input.amount }));
  } else {
    builder.addOperation(
      Operation.createClaimableBalance({
        asset: input.asset,
        amount: input.amount,
        claimants: [
          new Claimant(input.to, Claimant.predicateUnconditional()),
          new Claimant(sender, Claimant.predicateUnconditional()),
        ],
      }),
    );
  }
  return finish(builder);
}

/** Accepts a claimable balance (a gift), opening the trustline first if needed. */
export function buildClaimGift(input: {
  receiver: Account;
  network: NetworkParams;
  balanceId: string;
  asset: Asset;
  openTrustline: boolean;
}) {
  const builder = startTransaction(input.receiver, input.network);
  if (input.openTrustline) builder.addOperation(Operation.changeTrust({ asset: input.asset }));
  builder.addOperation(Operation.claimClaimableBalance({ balanceId: input.balanceId }));
  return finish(builder);
}

/**
 * Issues new copies of the sender's own token straight to someone. The sender
 * (the artist's wallet) is the transaction's source, so they pay the network
 * fee; the payment itself comes from the issuer account, whose platform-held
 * key co-signs. The receiver must already trust the asset.
 */
export function buildIssueTokens(input: {
  sender: Account;
  network: NetworkParams;
  issuer: string;
  to: string;
  asset: Asset;
  amount: string;
  memo?: string;
}) {
  const builder = startTransaction(input.sender, input.network, { memo: input.memo }).addOperation(
    Operation.payment({ source: input.issuer, destination: input.to, asset: input.asset, amount: input.amount }),
  );
  return finish(builder, [input.issuer]);
}
