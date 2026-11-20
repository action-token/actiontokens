import { Account, Asset } from "@stellar/stellar-sdk";

import {
  assetFor,
  buildSwap,
  networkFeeXlm,
  quoteSwap as priceSwap,
  type RechargeProblem,
  type SwapDirection,
  toStroops,
} from "@actiontokens/chain";
import { QUOTE_TTL_SECONDS } from "@actiontokens/chain/quote";
import { fundsOf } from "@actiontokens/chain/server";
import { AppError, ErrorCodes, isAppError } from "@actiontokens/errors";

import { type Context, isCustodial, type SessionUser } from "../../context";
import { transitionOrder } from "../order-state";
import { deliverOrder, failOrder, holdsLine, ownOrder, userSignature } from "../purchase";

/**
 * Swap with the platform treasury (the mother account), any amount, either way:
 * BANDCOIN → XLM (an `XLM_SWAP` order) or XLM → BANDCOIN (`BANDCOIN_SWAP`), at
 * today's price less the 2% cushion. One transaction moves both sides; the fan
 * pays the network fee and the treasury co-signs. Same steps as Recharge:
 * quote → start (order + transaction) → the fan signs → submit.
 */
export type SwapInput = { direction: SwapDirection; amount: string };
type ServiceCtx = Pick<Context, "db" | "chain" | "activity">;

const KINDS = { TO_XLM: "XLM_SWAP", TO_BANDCOIN: "BANDCOIN_SWAP" } as const;
const unavailable = (message: string): RechargeProblem => ({ code: "UNAVAILABLE", message });

async function price(ctx: ServiceCtx, user: SessionUser | null, input: SwapInput) {
  const { chain } = ctx;
  const mother = chain.config.mother;
  const [bandcoinUsd, rates, account, treasury] = await Promise.all([
    chain.bandcoinUsd().catch(() => null),
    chain.rates().catch(() => null),
    user ? chain.loadAccount(user.walletAddress) : null,
    mother ? chain.loadAccount(mother) : null,
  ]);
  const bandcoin = assetFor("BANDCOIN", chain.config.assets);
  const openTrustline =
    input.direction === "TO_BANDCOIN" && !(account && holdsLine(account, bandcoin));
  const funds = user ? fundsOf(account, chain.config.assets) : null;
  const quote = priceSwap({
    direction: input.direction,
    amount: input.amount,
    bandcoinUsd: bandcoinUsd ? toStroops(bandcoinUsd) : 0n,
    xlmUsd: rates ? toStroops(rates.xlmUsd) : 0n,
    funds,
    treasury: treasury ? fundsOf(treasury, chain.config.assets) : null,
    networkFeeXlm: networkFeeXlm(2 + Number(openTrustline), chain.config.network.baseFee),
    openTrustline,
  });

  // A wallet that isn't on the network yet can't swap; say only that.
  const problems =
    user && !account
      ? [unavailable("Your wallet needs its first XLM before it can swap.")]
      : quote.problems;
  return {
    quote: {
      ...quote,
      problems,
      ok: problems.length === 0,
      expiresAt: new Date(Date.now() + QUOTE_TTL_SECONDS * 1000).toISOString(),
    },
    account,
    openTrustline,
    bandcoinUsd,
  };
}

export async function quoteSwap(ctx: ServiceCtx, user: SessionUser | null, input: SwapInput) {
  return (await price(ctx, user, input)).quote;
}

/** Creates the order and the unsigned transaction. Nothing is signed or sent yet. */
export async function startSwap(ctx: ServiceCtx, user: SessionUser, input: SwapInput) {
  const { quote, account, openTrustline, bandcoinUsd } = await price(ctx, user, input);
  const mother = ctx.chain.config.mother;
  if (!quote.ok || !account || !mother)
    throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, {
      message: quote.problems[0]?.message ?? "This can't go through right now.",
      details: { problems: quote.problems },
    });

  const order = await ctx.db.order.create({
    data: {
      kind: KINDS[input.direction],
      buyerId: user.id,
      currency: quote.pay.currency,
      unitPrice: quote.pay.amount,
      platformFee: "0",
      total: quote.pay.amount,
      method: "WALLET",
      quoteExpiresAt: new Date(quote.expiresAt),
      breakdown: quote,
      rateUsd: bandcoinUsd,
    },
  });
  ctx.activity.set({
    targetType: "Order",
    targetId: order.id,
    amount: quote.pay.amount,
    currency: quote.pay.currency,
  });

  const bandcoin = assetFor("BANDCOIN", ctx.chain.config.assets);
  const assetOf = (currency: "BANDCOIN" | "XLM") =>
    currency === "XLM" ? Asset.native() : bandcoin;
  const built = buildSwap({
    buyer: new Account(account.accountId(), account.sequenceNumber()),
    network: ctx.chain.config.network,
    orderId: order.id,
    platform: mother,
    pay: { asset: assetOf(quote.pay.currency), amount: quote.pay.amount },
    receive: { asset: assetOf(quote.receive.currency), amount: quote.receive.amount },
    openTrustline,
  });
  // The hash doesn't change when signatures are added, so it pins the exact transaction.
  await transitionOrder(ctx.db, order.id, "AWAITING_SIGNATURE", { txHash: built.hash });
  return {
    orderId: order.id,
    quote,
    xdr: built.xdr,
    /** Custodial fans get the cancellable countdown; wallet users sign in their wallet */
    signer: isCustodial(user) ? ("custodial" as const) : ("wallet" as const),
  };
}

/** The viewer's swap order, or "not found". */
export async function ownSwapOrder(ctx: ServiceCtx, user: SessionUser, orderId: string) {
  const order = await ownOrder(ctx, user, orderId);
  if (order.kind !== "XLM_SWAP" && order.kind !== "BANDCOIN_SWAP")
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Order not found" });
  return order;
}

/**
 * Sends the swap: the fan's signature (the server signs for custodial
 * accounts only now, after the countdown), then the treasury's.
 */
export async function submitSwap(
  ctx: ServiceCtx,
  user: SessionUser,
  input: { orderId: string; xdr: string },
) {
  const { chain, db } = ctx;
  const order = await ownSwapOrder(ctx, user, input.orderId);
  const mother = chain.config.mother;
  if (!mother)
    throw new AppError(ErrorCodes.CONFIG_MISSING, { message: "Swap isn't available right now." });
  ctx.activity.set({
    targetType: "Order",
    targetId: order.id,
    amount: order.total.toString(),
    currency: order.currency,
  });
  if (order.status !== "AWAITING_SIGNATURE" || !order.txHash)
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, {
      message: `This order is already ${order.status.toLowerCase()}.`,
    });
  if (order.quoteExpiresAt && order.quoteExpiresAt < new Date()) {
    await transitionOrder(db, order.id, "FAILED", {
      failureCode: ErrorCodes.STELLAR_QUOTE_EXPIRED,
    });
    throw new AppError(ErrorCodes.STELLAR_QUOTE_EXPIRED);
  }

  let xdr = await userSignature(ctx, user, order.txHash, input.xdr);
  xdr = await chain.signWithServerKeys(xdr, [mother]);
  await transitionOrder(db, order.id, "SUBMITTED");
  try {
    const { hash } = await chain.submit(xdr);
    ctx.activity.set({ txHash: hash });
  } catch (error) {
    // A lost response may still have landed: leave it SUBMITTED for the worker to re-check.
    if (isAppError(error) && error.code === ErrorCodes.STELLAR_TX_SUBMIT_FAILED) throw error;
    await failOrder(ctx, order.id, error, null);
    throw error;
  }
  return deliverOrder(ctx, order.id);
}
