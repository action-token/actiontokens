import {
  type Account,
  FeeBumpTransaction,
  Memo,
  type Transaction,
  TransactionBuilder,
} from "@stellar/stellar-sdk";

import { toAmount } from "./money";
import { QUOTE_TTL_SECONDS } from "./quote";

/** Network settings every builder needs. Passed in, so builders never read env. */
export type NetworkParams = {
  passphrase: string;
  /** Per-operation base fee, in stroops */
  baseFee: string;
};

/** What a builder returns: the unsigned XDR and which platform-held keys must co-sign it. */
export type BuiltTransaction = {
  xdr: string;
  hash: string;
  /** Public keys the server signs with (issuer, storage) after the user signs */
  serverSigners: string[];
};

/**
 * A transaction whose source (and fee payer) is `source`. Every payment
 * builder makes the user the source, so the user always pays the network fee.
 */
export function startTransaction(
  source: Account,
  network: NetworkParams,
  options: { memo?: string; timeoutSeconds?: number } = {},
) {
  const builder = new TransactionBuilder(source, {
    fee: network.baseFee,
    networkPassphrase: network.passphrase,
  });
  if (options.memo) builder.addMemo(memoFor(options.memo));
  return builder.setTimeout(options.timeoutSeconds ?? QUOTE_TTL_SECONDS);
}

/**
 * Order ids go in the memo so `order.confirm` can match the transaction.
 * A cuid fits a 28-byte text memo; anything longer is rejected, not cut.
 */
export function memoFor(id: string) {
  if (new TextEncoder().encode(id).length > 28) throw new RangeError(`Memo too long: ${id}`);
  return Memo.text(id);
}

export function finish(
  builder: TransactionBuilder,
  serverSigners: Iterable<string> = [],
): BuiltTransaction {
  const tx = builder.build();
  return {
    xdr: tx.toXDR(),
    hash: Buffer.from(tx.hash()).toString("hex"),
    serverSigners: [...new Set(serverSigners)],
  };
}

/** The network fee for `operations` operations, in XLM, for quotes. */
export function networkFeeXlm(operations: number, baseFee: string): string {
  return toAmount(BigInt(baseFee) * BigInt(Math.max(1, operations)));
}

/**
 * Card orders: the treasury pays the network fee the card was charged for, so
 * a buyer with no spare XLM can still be the transaction's source. Wraps the
 * signed transaction; the inner hash (the order's txHash) is unchanged.
 */
export function wrapInFeeBump(
  signedXdr: string,
  feeSource: string,
  network: NetworkParams,
): string {
  const inner = TransactionBuilder.fromXDR(signedXdr, network.passphrase) as Transaction;
  return TransactionBuilder.buildFeeBumpTransaction(
    feeSource,
    network.baseFee,
    inner,
    network.passphrase,
  ).toXDR();
}

/**
 * The accounts whose signature this transaction needs: its source (the fee
 * payer of a fee bump) and the source of every operation. Stellar refuses a
 * signature from anyone else (tx_bad_auth_extra), so the server only signs
 * for keys in here.
 */
export function signersNeeded(xdr: string, passphrase: string): Set<string> {
  const tx = TransactionBuilder.fromXDR(xdr, passphrase);
  if (tx instanceof FeeBumpTransaction) return new Set([tx.feeSource]);
  return new Set([tx.source, ...tx.operations.flatMap((op) => (op.source ? [op.source] : []))]);
}
