import { type Account, Asset, Claimant, Operation } from "@stellar/stellar-sdk";

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
  /** False for an address with no account yet: XLM then opens it (at least 1 XLM) */
  receiverExists?: boolean;
  memo?: string;
}) {
  const sender = input.sender.accountId();
  const builder = startTransaction(input.sender, input.network, { memo: input.memo });

  if (input.asset.isNative() && input.receiverExists === false) {
    builder.addOperation(
      Operation.createAccount({ destination: input.to, startingBalance: input.amount }),
    );
  } else if (input.receiverTrusts || input.asset.isNative()) {
    builder.addOperation(
      Operation.payment({ destination: input.to, asset: input.asset, amount: input.amount }),
    );
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
 * An artist's gift from their storage account, as the old Bandcoin sent it.
 * The artist's wallet is the source and pays the fee. A fan who trusts the
 * token is paid straight from storage; otherwise storage makes a claimable
 * balance they accept later (storage can take it back until then), and the
 * artist sends storage the 0.5 XLM that balance locks. Storage co-signs.
 */
export function buildStorageGift(input: {
  sender: Account;
  network: NetworkParams;
  storage: string;
  to: string;
  asset: Asset;
  amount: string;
  /** The fan doesn't trust the token yet */
  claimable: boolean;
  memo?: string;
}) {
  const builder = startTransaction(input.sender, input.network, { memo: input.memo });
  if (input.claimable) {
    builder.addOperation(
      Operation.payment({
        destination: input.storage,
        asset: Asset.native(),
        amount: CLAIMABLE_RESERVE_XLM,
      }),
    );
    builder.addOperation(
      Operation.createClaimableBalance({
        source: input.storage,
        asset: input.asset,
        amount: input.amount,
        claimants: [
          new Claimant(input.to, Claimant.predicateUnconditional()),
          new Claimant(input.storage, Claimant.predicateUnconditional()),
        ],
      }),
    );
  } else {
    builder.addOperation(
      Operation.payment({
        source: input.storage,
        destination: input.to,
        asset: input.asset,
        amount: input.amount,
      }),
    );
  }
  return finish(builder, [input.storage]);
}

/**
 * An artist takes back a gift nobody accepted yet. The artist's wallet is the
 * source and pays the fee; storage claims its own balance (the tokens return
 * to storage) and pays the artist back the XLM the balance had locked.
 * Storage co-signs.
 */
export function buildStorageTakeBack(input: {
  sender: Account;
  network: NetworkParams;
  storage: string;
  balanceId: string;
}) {
  const builder = startTransaction(input.sender, input.network)
    .addOperation(
      Operation.claimClaimableBalance({ source: input.storage, balanceId: input.balanceId }),
    )
    .addOperation(
      Operation.payment({
        source: input.storage,
        destination: input.sender.accountId(),
        asset: Asset.native(),
        amount: CLAIMABLE_RESERVE_XLM,
      }),
    );
  return finish(builder, [input.storage]);
}

/** What a claimable balance locks in its creator's account: one base reserve per claimant. */
export const CLAIMABLE_RESERVE_XLM = "1";

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
    Operation.payment({
      source: input.issuer,
      destination: input.to,
      asset: input.asset,
      amount: input.amount,
    }),
  );
  return finish(builder, [input.issuer]);
}
