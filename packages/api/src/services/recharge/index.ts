import { Account } from "@stellar/stellar-sdk";

import {
  assetFor,
  buildTopUp,
  buildXlmSwap,
  networkFeeXlm,
  quoteTopUp,
  quoteXlmSwap,
  toCents,
  toStroops,
  wrapInFeeBump,
  XLM_SWAP_AMOUNT,
  type RechargeProblem,
} from "@bandcoin/chain";
import { QUOTE_TTL_SECONDS } from "@bandcoin/chain/quote";
import { fundsOf } from "@bandcoin/chain/server";
import { AppError, ErrorCodes, isAppError } from "@bandcoin/errors";

import { type Context, isCustodial, type SessionUser } from "../../context";
import { transitionOrder } from "../order-state";
import { deliverOrder, failOrder, holdsLine, ownOrder, userSignature } from "../purchase";

/**
 * Recharge, from price to delivery. Same steps as buying an item, so the
 * screens and the custodial countdown behave the same:
 *
 *   quote  → the breakdown (refreshes while the fan looks at it)
 *   start  → creates the order and the transaction the fan signs
 *   submit → the platform co-signs; a top-up charges the card first, pays the
 *            network fee (fee bump) and refunds the card if the chain says no
 *   cancel → `cancelPurchase`, which works on any order
 *
 * Two separate things, never one triggering the other:
 *   TOP_UP    card → BANDCOIN from the mother account
 *   XLM_SWAP  BANDCOIN → exactly 1 XLM, paid by the fan
 */

export type RechargeInput = { kind: "TOP_UP"; packageUsd: string } | { kind: "XLM_SWAP" };
type ServiceCtx = Pick<Context, "db" | "chain" | "activity">;

async function priceRecharge(ctx: ServiceCtx, user: SessionUser | null, input: RechargeInput) {
  const { chain } = ctx;
  const [bandcoinUsd, rates, account] = await Promise.all([
    chain.bandcoinUsd().catch(rateFailure),
    chain.rates().catch(rateFailure),
    user ? chain.loadAccount(user.walletAddress) : null,
  ]);
  const funds = user ? fundsOf(account, chain.config.assets) : null;
  const asset = assetFor("BANDCOIN", chain.config.assets);
  const rate =
    bandcoinUsd && rates
      ? { bandcoinUsd: toStroops(bandcoinUsd), xlmUsd: toStroops(rates.xlmUsd) }
      : { bandcoinUsd: 0n, xlmUsd: 0n };
  const { baseFee } = chain.config.network;

  const openTrustline = !(account && holdsLine(account, asset));
  const quote =
    input.kind === "TOP_UP"
      ? {
          kind: "TOP_UP" as const,
          // trustline (if new) + payment + the fee bump
          ...quoteTopUp({
            packageUsd: input.packageUsd,
            ...rate,
            networkFeeXlm: networkFeeXlm(2 + Number(openTrustline), baseFee),
            openTrustline,
            xlmFunds: account ? (funds?.XLM ?? null) : null,
          }),
        }
      : {
          kind: "XLM_SWAP" as const,
          ...quoteXlmSwap({
            ...rate,
            bandcoinBalance: funds?.BANDCOIN ?? null,
            networkFeeXlm: networkFeeXlm(2, baseFee),
          }),
        };

  const extra: RechargeProblem[] = [];
  if (!chain.config.mother)
    extra.push({ code: "UNAVAILABLE", message: "Recharge isn't available right now." });
  else if (user && !account) {
    extra.push({
      code: "UNAVAILABLE",
      message: "Your wallet needs its first XLM before it can be recharged.",
    });
  }
  const problems = [...extra, ...quote.problems];
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

/** A failed price lookup shows as "price unavailable" in the quote instead of an error page. */
function rateFailure(): null {
  return null;
}

export async function quoteRecharge(
  ctx: ServiceCtx,
  user: SessionUser | null,
  input: RechargeInput,
) {
  return (await priceRecharge(ctx, user, input)).quote;
}

/** Creates the order and the unsigned transaction. Nothing is signed or charged yet. */
export async function startRecharge(ctx: ServiceCtx, user: SessionUser, input: RechargeInput) {
  const priced = await priceRecharge(ctx, user, input);
  const { quote, account } = priced;
  const mother = ctx.chain.config.mother;
  if (!quote.ok || !account || !mother) {
    throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, {
      message: quote.problems[0]?.message ?? "This can't go through right now.",
      details: { problems: quote.problems },
    });
  }

  const card = quote.kind === "TOP_UP";
  const total = quote.kind === "TOP_UP" ? input.kind === "TOP_UP" && input.packageUsd : quote.total;
  const order = await ctx.db.order.create({
    data: {
      kind: card ? "RECHARGE" : "XLM_SWAP",
      buyerId: user.id,
      currency: card ? "USD" : "BANDCOIN",
      unitPrice: total as string,
      platformFee: "0",
      total: total as string,
      method: card ? "CARD" : "WALLET",
      quoteExpiresAt: new Date(quote.expiresAt),
      breakdown: quote,
      rateUsd: priced.bandcoinUsd,
    },
  });
  ctx.activity.set({
    targetType: "Order",
    targetId: order.id,
    amount: String(total),
    currency: card ? "USD" : "BANDCOIN",
  });

  const { network, assets } = ctx.chain.config;
  const buyer = new Account(account.accountId(), account.sequenceNumber());
  const asset = assetFor("BANDCOIN", assets);
  const built =
    quote.kind === "TOP_UP"
      ? buildTopUp({
          buyer,
          network,
          orderId: order.id,
          asset,
          from: mother,
          amount: quote.receive,
          openTrustline: priced.openTrustline,
        })
      : buildXlmSwap({
          buyer,
          network,
          orderId: order.id,
          asset,
          platform: mother,
          pay: quote.total,
          xlm: XLM_SWAP_AMOUNT,
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

/**
 * Sends the recharge. `xdr` is the transaction from `start`, signed by the
 * wallet for wallet users and unsigned for custodial users (the server signs
 * only now, after the countdown ran out without Cancel). A top-up charges the
 * card before anything is submitted.
 */
export async function submitRecharge(
  ctx: ServiceCtx,
  user: SessionUser,
  input: { orderId: string; xdr: string; card?: { sourceId: string; verificationToken?: string } },
) {
  const { chain, db } = ctx;
  const order = await ownOrder(ctx, user, input.orderId);
  if (order.kind !== "RECHARGE" && order.kind !== "XLM_SWAP") {
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Order not found" });
  }
  const mother = chain.config.mother;
  if (!mother)
    throw new AppError(ErrorCodes.CONFIG_MISSING, {
      message: "Recharge isn't available right now.",
    });
  ctx.activity.set({
    targetType: "Order",
    targetId: order.id,
    amount: order.total.toString(),
    currency: order.currency,
  });

  if (order.status !== "AWAITING_SIGNATURE" || !order.txHash) {
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
  const card = order.method === "CARD";
  if (card && !input.card)
    throw new AppError(ErrorCodes.VALIDATION_FAILED, { message: "Add a card to pay." });

  let xdr = await userSignature(ctx, user, order.txHash, input.xdr);
  xdr = await chain.signWithServerKeys(xdr, [mother]);
  if (card)
    xdr = await chain.signWithServerKeys(wrapInFeeBump(xdr, mother, chain.config.network), [
      mother,
    ]);

  let cardPaymentId: string | null = null;
  if (card && input.card) {
    ({ paymentId: cardPaymentId } = await chain.card.charge({
      orderId: order.id,
      sourceId: input.card.sourceId,
      verificationToken: input.card.verificationToken,
      cents: toCents(toStroops(order.total.toString())),
    }));
  }

  await transitionOrder(db, order.id, "SUBMITTED", { cardPaymentId });
  try {
    const { hash } = await chain.submit(xdr);
    ctx.activity.set({ txHash: hash });
  } catch (error) {
    // A lost response may still have landed: leave it SUBMITTED for the worker to re-check.
    if (isAppError(error) && error.code === ErrorCodes.STELLAR_TX_SUBMIT_FAILED) throw error;
    await failOrder(
      ctx,
      order.id,
      error,
      cardPaymentId ? { paymentId: cardPaymentId, total: order.total.toString() } : null,
    );
    throw error;
  }
  return deliverOrder(ctx, order.id);
}
