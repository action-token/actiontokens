import { type Account, Asset, Operation } from "@stellar/stellar-sdk";

import { finish, type NetworkParams, startTransaction } from "../transaction";

export type Payout = { to: string; amount: string };

export type ClassicPurchaseInput = {
  /** The buyer's loaded account: source of the transaction, so they pay the fee */
  buyer: Account;
  network: NetworkParams;
  /** Order id, written to the memo */
  orderId: string;
  /** null: a Non Stellar item, a plain payment with nothing delivered on Stellar */
  item: Asset | null;
  /**
   * The payouts. Wallet orders: the buyer pays seller, fee and royalty.
   * Card orders: `from` is the treasury, paying the seller (and royalty) in
   * BANDCOIN; the platform fee stays with the card charge.
   */
  payment: {
    asset: Asset;
    /** Payer when it isn't the buyer (card orders: the treasury) */
    from?: string;
    seller: Payout;
    platformFee?: Payout;
    /** Resales only: the creator's cut */
    royalty?: Payout;
  } | null;
  /** Card orders: XLM the treasury sends the buyer for the trustline reserve (charged to the card) */
  topUp?: { from: string; amount: string };
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
 * the copies. Payment and delivery succeed or fail together. The buyer is
 * always the source; card orders are fee-bumped by the treasury on submit
 * (`wrapInFeeBump`), since the card already paid those costs.
 */
export function buildClassicPurchase(input: ClassicPurchaseInput) {
  const buyer = input.buyer.accountId();
  const { fromStock, mint } = input.delivery;
  const item = input.item;
  if (item && !fromStock && !mint) throw new RangeError("A purchase must deliver something");
  if (!item && (fromStock || mint || input.openTrustline))
    throw new RangeError("A Non Stellar item has nothing to deliver on Stellar");
  if (!item && !input.payment) throw new RangeError("A Non Stellar item needs a payment");

  const builder = startTransaction(input.buyer, input.network, { memo: input.orderId });
  const serverSigners: string[] = [];

  if (input.topUp && !isZero(input.topUp.amount)) {
    builder.addOperation(
      Operation.payment({
        source: input.topUp.from,
        destination: buyer,
        asset: Asset.native(),
        amount: input.topUp.amount,
      }),
    );
    serverSigners.push(input.topUp.from);
  }

  if (item && input.openTrustline) builder.addOperation(Operation.changeTrust({ asset: item }));

  if (input.payment) {
    const { asset, from, seller, platformFee, royalty } = input.payment;
    for (const payout of [seller, platformFee, royalty]) {
      if (!payout || isZero(payout.amount)) continue;
      builder.addOperation(
        Operation.payment({
          ...(from ? { source: from } : {}),
          destination: payout.to,
          asset,
          amount: payout.amount,
        }),
      );
      if (from) serverSigners.push(from);
    }
  }

  if (item && fromStock && !isZero(fromStock.amount)) {
    builder.addOperation(
      Operation.payment({
        source: fromStock.account,
        destination: buyer,
        asset: item,
        amount: fromStock.amount,
      }),
    );
    serverSigners.push(fromStock.account);
  }
  if (item && mint && !isZero(mint.amount)) {
    builder.addOperation(
      Operation.payment({
        source: mint.issuer,
        destination: buyer,
        asset: item,
        amount: mint.amount,
      }),
    );
    serverSigners.push(mint.issuer);
  }

  return finish(builder, serverSigners);
}

/**
 * Operations a purchase will have, for the network-fee line of the quote.
 * Card orders pay the seller (and royalty) from the treasury, top up the
 * reserve, and are wrapped in a fee bump, which counts as one more.
 */
export function classicPurchaseOperations(p: {
  card: boolean;
  openTrustline: boolean;
  royalty: boolean;
  fromStock: boolean;
  mint: boolean;
}) {
  const payouts = 1 + Number(p.royalty) + Number(!p.card);
  const cardExtras = p.card ? Number(p.openTrustline) + 1 : 0;
  return Number(p.openTrustline) + payouts + Number(p.fromStock) + Number(p.mint) + cardExtras;
}

export const isZero = (amount: string) => /^0*(\.0*)?$/.test(amount);
