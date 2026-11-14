import { type Account, Asset, Operation } from "@stellar/stellar-sdk";

import { isZero } from "./purchase";
import { finish, type NetworkParams, startTransaction } from "../transaction";

/**
 * Card top-up: the platform sends BANDCOIN to the buyer, who opens the
 * trustline first if needed. The buyer is the source, so the same signing
 * flow as a purchase applies; the platform account fee-bumps it on submit.
 * `reserveXlm`: XLM the platform sends first so a new trustline can be opened
 * (paid for by the card).
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
  reserveXlm?: string;
}) {
  if (isZero(input.amount)) throw new RangeError("A top-up must deliver something");
  const builder = startTransaction(input.buyer, input.network, { memo: input.orderId });
  if (input.reserveXlm && !isZero(input.reserveXlm))
    builder.addOperation(
      Operation.payment({
        source: input.from,
        destination: input.buyer.accountId(),
        asset: Asset.native(),
        amount: input.reserveXlm,
      }),
    );
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
 * A swap with the platform: the buyer pays one asset and receives the other,
 * together or not at all, opening the line for what arrives first when the
 * wallet has none. The buyer pays the network fee as the source.
 */
export function buildSwap(input: {
  buyer: Account;
  network: NetworkParams;
  orderId: string;
  platform: string;
  pay: { asset: Asset; amount: string };
  receive: { asset: Asset; amount: string };
  openTrustline: boolean;
}) {
  if (isZero(input.pay.amount) || isZero(input.receive.amount))
    throw new RangeError("A swap must move something both ways");
  const builder = startTransaction(input.buyer, input.network, { memo: input.orderId });
  if (input.openTrustline)
    builder.addOperation(Operation.changeTrust({ asset: input.receive.asset }));
  builder
    .addOperation(
      Operation.payment({
        destination: input.platform,
        asset: input.pay.asset,
        amount: input.pay.amount,
      }),
    )
    .addOperation(
      Operation.payment({
        source: input.platform,
        destination: input.buyer.accountId(),
        asset: input.receive.asset,
        amount: input.receive.amount,
      }),
    );
  return finish(builder, [input.platform]);
}

/**
 * Subscribing with BANDCOIN, USDC or XLM (plan 33): the fan pays the platform
 * for the XLM it sends (not when paying in XLM), the platform fee goes to the
 * treasury, and the fan's own account opens the fan-token line, all together
 * or not at all. The fan is the source and pays the network fee.
 */
export function buildTrustWithPayment(input: {
  buyer: Account;
  network: NetworkParams;
  orderId: string;
  /** The artist's fan token */
  token: Asset;
  /** What the fan pays in */
  asset: Asset;
  /** The platform account that sells the XLM (BANDCOIN, USDC) */
  platform: string;
  /** To the platform for the XLM; "0" when paying in XLM */
  pay: string;
  /** XLM the platform sends; "0" when paying in XLM */
  sendXlm: string;
  treasury: string;
  fee: string;
}) {
  if (isZero(input.pay) !== isZero(input.sendXlm))
    throw new RangeError("XLM is sent only when it is paid for");
  const builder = startTransaction(input.buyer, input.network, { memo: input.orderId });
  if (!isZero(input.pay))
    builder.addOperation(
      Operation.payment({ destination: input.platform, asset: input.asset, amount: input.pay }),
    );
  if (!isZero(input.fee))
    builder.addOperation(
      Operation.payment({ destination: input.treasury, asset: input.asset, amount: input.fee }),
    );
  if (!isZero(input.sendXlm))
    builder.addOperation(
      Operation.payment({
        source: input.platform,
        destination: input.buyer.accountId(),
        asset: Asset.native(),
        amount: input.sendXlm,
      }),
    );
  builder.addOperation(Operation.changeTrust({ asset: input.token }));
  return finish(builder, isZero(input.sendXlm) ? [] : [input.platform]);
}

/**
 * Subscribing by card (plan 33): the card paid in USD, so the platform sends
 * the XLM the line(s) lock, the fan opens a BANDCOIN line when one is needed
 * and the fan-token line, and what's left of the charge arrives as BANDCOIN.
 * The fan is the source; the platform fee-bumps it on submit.
 */
export function buildTrustByCard(input: {
  buyer: Account;
  network: NetworkParams;
  orderId: string;
  token: Asset;
  /** The platform account that sends the XLM and BANDCOIN */
  from: string;
  sendXlm: string;
  bandcoin: { asset: Asset; amount: string; openLine: boolean };
}) {
  if (isZero(input.sendXlm)) throw new RangeError("The line's reserve must be sent");
  const builder = startTransaction(input.buyer, input.network, {
    memo: input.orderId,
  }).addOperation(
    Operation.payment({
      source: input.from,
      destination: input.buyer.accountId(),
      asset: Asset.native(),
      amount: input.sendXlm,
    }),
  );
  if (input.bandcoin.openLine)
    builder.addOperation(Operation.changeTrust({ asset: input.bandcoin.asset }));
  builder.addOperation(Operation.changeTrust({ asset: input.token }));
  if (!isZero(input.bandcoin.amount))
    builder.addOperation(
      Operation.payment({
        source: input.from,
        destination: input.buyer.accountId(),
        asset: input.bandcoin.asset,
        amount: input.bandcoin.amount,
      }),
    );
  return finish(builder, [input.from]);
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
