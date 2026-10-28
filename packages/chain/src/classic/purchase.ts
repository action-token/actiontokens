import { type Account, type Asset, Operation } from "@stellar/stellar-sdk";

import { finish, type NetworkParams, startTransaction } from "../transaction";

export type Payout = { to: string; amount: string };

export type ClassicPurchaseInput = {
  /** The buyer's loaded account: source of the transaction, so they pay the fee */
  buyer: Account;
  network: NetworkParams;
  /** Order id, written to the memo */
  orderId: string;
  item: Asset;
  /**
   * What the buyer pays. Null for a card order: the card was charged the
   * price and fee, and this transaction only delivers.
   */
  payment: {
    asset: Asset;
    seller: Payout;
    platformFee: Payout;
    /** Resales only: the creator's cut */
    royalty?: Payout;
  } | null;
  /** Where the copies come from: already minted stock, minted now by the artist's issuer, or both */
  delivery: {
    fromStock?: { account: string; amount: string };
    mint?: { issuer: string; amount: string };
  };
  /** The buyer has no trustline for the item yet */
  openTrustline: boolean;
};

/**
 * One transaction for a classic-token purchase: the buyer opens the trustline
 * if needed, pays the seller, the platform fee and any royalty, and receives
 * the copies. Payment and delivery succeed or fail together.
 */
export function buildClassicPurchase(input: ClassicPurchaseInput) {
  const buyer = input.buyer.accountId();
  const { fromStock, mint } = input.delivery;
  if (!fromStock && !mint) throw new RangeError("A purchase must deliver something");

  const builder = startTransaction(input.buyer, input.network, { memo: input.orderId });
  const serverSigners: string[] = [];

  if (input.openTrustline) builder.addOperation(Operation.changeTrust({ asset: input.item }));

  if (input.payment) {
    const { asset, seller, platformFee, royalty } = input.payment;
    for (const payout of [seller, platformFee, royalty]) {
      if (!payout || isZero(payout.amount)) continue;
      builder.addOperation(Operation.payment({ destination: payout.to, asset, amount: payout.amount }));
    }
  }

  if (fromStock && !isZero(fromStock.amount)) {
    builder.addOperation(
      Operation.payment({
        source: fromStock.account,
        destination: buyer,
        asset: input.item,
        amount: fromStock.amount,
      }),
    );
    serverSigners.push(fromStock.account);
  }
  if (mint && !isZero(mint.amount)) {
    builder.addOperation(
      Operation.payment({ source: mint.issuer, destination: buyer, asset: input.item, amount: mint.amount }),
    );
    serverSigners.push(mint.issuer);
  }

  return finish(builder, serverSigners);
}

/** Operations a purchase will have, for the network-fee line of the quote. */
export function classicPurchaseOperations(p: {
  openTrustline: boolean;
  paid: boolean;
  royalty: boolean;
  fromStock: boolean;
  mint: boolean;
}) {
  return (
    Number(p.openTrustline) +
    (p.paid ? 2 + Number(p.royalty) : 0) +
    Number(p.fromStock) +
    Number(p.mint)
  );
}

export const isZero = (amount: string) => /^0*(\.0*)?$/.test(amount);
