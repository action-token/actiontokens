import { type Account, type Asset, Operation } from "@stellar/stellar-sdk";

import { finish, type NetworkParams, startTransaction } from "../transaction";

/**
 * A user paying the platform for something that isn't an item: a vanity URL
 * renewal or a studio coin top-up. The order id in the memo ties the payment
 * to its order.
 */
export function buildPlatformPayment(input: {
  payer: Account;
  network: NetworkParams;
  orderId: string;
  to: string;
  asset: Asset;
  amount: string;
}) {
  const builder = startTransaction(input.payer, input.network, { memo: input.orderId }).addOperation(
    Operation.payment({ destination: input.to, asset: input.asset, amount: input.amount }),
  );
  return finish(builder);
}
