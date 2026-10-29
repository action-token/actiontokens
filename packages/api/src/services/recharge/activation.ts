import { Account } from "@stellar/stellar-sdk";

import {
  buildActivation,
  networkFeeXlm,
  quoteActivation as priceActivation,
  toCents,
  toStroops,
  type RechargeProblem,
} from "@bandcoin/chain";
import { QUOTE_TTL_SECONDS } from "@bandcoin/chain/quote";
import { AppError, ErrorCodes, isAppError } from "@bandcoin/errors";

import type { Context, SessionUser } from "../../context";
import { transitionOrder } from "../order-state";
import { deliverOrder, failOrder, ownOrder } from "../purchase";

/**
 * Activating a brand-new wallet. A Stellar account doesn't exist until
 * something sends it XLM, so the platform creates it: the fan pays by card, the
 * card price buys the XLM, and `createAccount` funds the new wallet with it.
 * The fan signs nothing (their account isn't on the network yet), so there is
 * no countdown or wallet popup: entering the card is the confirmation.
 *
 *   quote  → the breakdown
 *   start  → locks the quote in an order
 *   submit → charges the card, then creates the account; refunds if the chain says no
 *
 * The transaction is built at submit time, with the platform account's fresh
 * sequence number, because nothing about it needs to be pinned earlier.
 */
type ServiceCtx = Pick<Context, "db" | "chain" | "activity">;

async function price(ctx: ServiceCtx, user: SessionUser | null) {
  const { chain } = ctx;
  const [rates, account] = await Promise.all([
    chain.rates().catch(() => null),
    user ? chain.loadAccount(user.walletAddress) : null,
  ]);
  const quote = priceActivation({
    xlmUsd: rates ? toStroops(rates.xlmUsd) : 0n,
    // one operation, paid by the platform account
    networkFeeXlm: networkFeeXlm(1, chain.config.network.baseFee),
  });
  const extra: RechargeProblem[] = [];
  if (!chain.config.mother)
    extra.push({ code: "UNAVAILABLE", message: "Activation isn't available right now." });
  else if (account) extra.push({ code: "UNAVAILABLE", message: "Your wallet is already active." });
  const problems = [...extra, ...quote.problems];
  return {
    quote: {
      ...quote,
      problems,
      ok: problems.length === 0,
      expiresAt: new Date(Date.now() + QUOTE_TTL_SECONDS * 1000).toISOString(),
    },
    rate: rates?.xlmUsd ?? null,
  };
}

export async function quoteActivation(ctx: ServiceCtx, user: SessionUser | null) {
  return (await price(ctx, user)).quote;
}

export async function startActivation(ctx: ServiceCtx, user: SessionUser) {
  const { quote, rate } = await price(ctx, user);
  if (!quote.ok) {
    throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, {
      message: quote.problems[0]?.message ?? "Activation can't go through right now.",
      details: { problems: quote.problems },
    });
  }
  const total = (quote.chargeCents / 100).toFixed(2);
  const order = await ctx.db.order.create({
    data: {
      kind: "ACTIVATION",
      buyerId: user.id,
      currency: "USD",
      unitPrice: total,
      platformFee: "0",
      total,
      method: "CARD",
      quoteExpiresAt: new Date(quote.expiresAt),
      breakdown: quote,
      rateUsd: rate,
    },
  });
  ctx.activity.set({ targetType: "Order", targetId: order.id, amount: total, currency: "USD" });
  await transitionOrder(ctx.db, order.id, "AWAITING_SIGNATURE");
  return { orderId: order.id, quote };
}

export async function submitActivation(
  ctx: ServiceCtx,
  user: SessionUser,
  input: { orderId: string; card?: { sourceId: string; verificationToken?: string } },
) {
  const { chain, db } = ctx;
  const order = await ownOrder(ctx, user, input.orderId);
  if (order.kind !== "ACTIVATION")
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Order not found" });
  const mother = chain.config.mother;
  if (!mother)
    throw new AppError(ErrorCodes.CONFIG_MISSING, {
      message: "Activation isn't available right now.",
    });
  ctx.activity.set({
    targetType: "Order",
    targetId: order.id,
    amount: order.total.toString(),
    currency: order.currency,
  });

  if (order.status !== "AWAITING_SIGNATURE") {
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, {
      message: `This order is already ${order.status.toLowerCase()}.`,
    });
  }
  if (order.quoteExpiresAt && order.quoteExpiresAt < new Date()) {
    await transitionOrder(db, order.id, "FAILED", {
      failureCode: ErrorCodes.STELLAR_QUOTE_EXPIRED,
    });
    throw new AppError(ErrorCodes.STELLAR_QUOTE_EXPIRED);
  }
  if (!input.card)
    throw new AppError(ErrorCodes.VALIDATION_FAILED, { message: "Add a card to pay." });

  // The quote is locked, but the wallet may have been funded since: never charge for nothing.
  const [existing, platform] = await Promise.all([
    chain.loadAccount(user.walletAddress),
    chain.loadAccount(mother),
  ]);
  if (existing) {
    await transitionOrder(db, order.id, "CANCELED");
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, { message: "Your wallet is already active." });
  }
  if (!platform) throw new AppError(ErrorCodes.STORAGE_ACCOUNT_UNAVAILABLE);

  const breakdown = order.breakdown as { startingBalance: string };
  const built = buildActivation({
    platform: new Account(platform.accountId(), platform.sequenceNumber()),
    network: chain.config.network,
    orderId: order.id,
    destination: user.walletAddress,
    startingBalance: breakdown.startingBalance,
  });
  const xdr = await chain.signWithServerKeys(built.xdr, [mother]);

  const { paymentId } = await chain.card.charge({
    orderId: order.id,
    sourceId: input.card.sourceId,
    verificationToken: input.card.verificationToken,
    cents: toCents(toStroops(order.total.toString())),
  });
  await transitionOrder(db, order.id, "SUBMITTED", {
    cardPaymentId: paymentId,
    txHash: built.hash,
  });
  try {
    const { hash } = await chain.submit(xdr);
    ctx.activity.set({ txHash: hash });
  } catch (error) {
    // A lost response may still have landed: leave it SUBMITTED for the worker to re-check.
    if (isAppError(error) && error.code === ErrorCodes.STELLAR_TX_SUBMIT_FAILED) throw error;
    await failOrder(ctx, order.id, error, { paymentId, total: order.total.toString() });
    throw error;
  }
  return deliverOrder(ctx, order.id);
}
