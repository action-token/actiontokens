import {
  type Asset,
  FeeBumpTransaction,
  type Transaction,
  TransactionBuilder,
} from "@stellar/stellar-sdk";

import { toStroops } from "./money";

export type ExpectedPayment = { from?: string; to: string; asset: Asset; amount: string };

export type Expectation = {
  /** The account that must have been the source (the buyer) */
  source: string;
  /** The order id */
  memo: string;
  payments: ExpectedPayment[];
};

/** A transaction's text memo ("" when it has none). */
export function memoText(tx: Transaction): string {
  const { value } = tx.memo;
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value : new TextDecoder().decode(value);
}

/**
 * Checks that a transaction does what its order says before the order is
 * marked paid: right source, memo = order id, and every expected payment
 * present with the exact destination, asset and amount. Used by
 * `order.confirm` on the envelope Horizon returns, so a client can't confirm
 * an order with some other transaction.
 */
export function verifyTransaction(envelopeXdr: string, passphrase: string, expected: Expectation) {
  const parsed = TransactionBuilder.fromXDR(envelopeXdr, passphrase);
  const tx: Transaction = parsed instanceof FeeBumpTransaction ? parsed.innerTransaction : parsed;
  const mismatches: string[] = [];

  if (tx.source !== expected.source)
    mismatches.push(`source is ${tx.source}, expected ${expected.source}`);
  const memo = memoText(tx);
  if (memo !== expected.memo) mismatches.push(`memo is "${memo}", expected "${expected.memo}"`);

  const payments = tx.operations.flatMap((op) =>
    op.type === "payment"
      ? [{ from: op.source ?? tx.source, to: op.destination, asset: op.asset, amount: op.amount }]
      : [],
  );
  const unmatched = [...payments];
  for (const want of expected.payments) {
    const index = unmatched.findIndex(
      (got) =>
        got.to === want.to &&
        got.asset.equals(want.asset) &&
        toStroops(got.amount) === toStroops(want.amount) &&
        (want.from === undefined || got.from === want.from),
    );
    if (index === -1) {
      mismatches.push(`missing payment of ${want.amount} ${want.asset.getCode()} to ${want.to}`);
    } else {
      unmatched.splice(index, 1);
    }
  }

  return { ok: mismatches.length === 0, mismatches };
}
