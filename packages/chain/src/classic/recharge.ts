import { type Account, Asset, Operation } from "@stellar/stellar-sdk";

import { isZero } from "./purchase";
import { finish, type NetworkParams, startTransaction } from "../transaction";

/**
 * Card top-up: the platform sends BANDCOIN to the buyer, who opens the
 * trustline first if needed. The buyer is the source, so the same signing
 * flow as a purchase applies; the platform account fee-bumps it on submit.
 */
export function buildTopUp(input: {
  buyer: Account;
  network: NetworkParams;
  orderId: string;
  asset: Asset;
  /** The platform account that sends the BANDCOIN */
  from: string;
  amount: string;
  openTrustline: boolean;
}) {
  if (isZero(input.amount)) throw new RangeError("A top-up must deliver something");
  const builder = startTransaction(input.buyer, input.network, { memo: input.orderId });
  if (input.openTrustline) builder.addOperation(Operation.changeTrust({ asset: input.asset }));
  builder.addOperation(
    Operation.payment({
      source: input.from,
      destination: input.buyer.accountId(),
      asset: input.asset,
      amount: input.amount,
    }),
  );
  return finish(builder, [input.from]);
}

/**
 * The XLM swap: the buyer pays BANDCOIN to the platform and receives exactly
 * `xlm`, together or not at all. The buyer pays the network fee as the source.
 */
export function buildXlmSwap(input: {
  buyer: Account;
  network: NetworkParams;
  orderId: string;
  asset: Asset;
  platform: string;
  pay: string;
  xlm: string;
}) {
  if (isZero(input.pay) || isZero(input.xlm))
    throw new RangeError("A swap must move something both ways");
  const builder = startTransaction(input.buyer, input.network, { memo: input.orderId })
    .addOperation(
      Operation.payment({ destination: input.platform, asset: input.asset, amount: input.pay }),
    )
    .addOperation(
      Operation.payment({
        source: input.platform,
        destination: input.buyer.accountId(),
        asset: Asset.native(),
        amount: input.xlm,
      }),
    );
  return finish(builder, [input.platform]);
}

/**
 * Activation: the platform creates the fan's account with its starting XLM.
 * The platform account is the source (and fee payer), so the fan, whose account
 * doesn't exist yet, signs nothing.
 */
export function buildActivation(input: {
  platform: Account;
  network: NetworkParams;
  orderId: string;
  destination: string;
  startingBalance: string;
}) {
  if (isZero(input.startingBalance)) throw new RangeError("An activation must fund the account");
  const builder = startTransaction(input.platform, input.network, {
    memo: input.orderId,
  }).addOperation(
    Operation.createAccount({
      destination: input.destination,
      startingBalance: input.startingBalance,
    }),
  );
  return finish(builder, [input.platform.accountId()]);
}
