import { Account } from "@stellar/stellar-sdk";

import {
  assetFor,
  buildPlatformPayment,
  networkFeeXlm,
  type OnChainCurrency,
  toCents,
  toStroops,
} from "@bandcoin/chain";
import { buildQuote, QUOTE_TTL_SECONDS, type QuoteProblem } from "@bandcoin/chain/quote";
import { fundsOf } from "@bandcoin/chain/server";
import { AppError, ErrorCodes, isAppError } from "@bandcoin/errors";

import { type Context, isCustodial, type SessionUser } from "../../context";
import { transitionOrder } from "../order-state";
import { failOrder, ownOrder, userSignature } from "../purchase";
import { creditCoins } from "./balance";
import { coinsForUsd, MAX_TOP_UP_USD, MIN_TOP_UP_USD } from "./pricing";

/**
 * Buying Studio coins. One coin is one cent: a top-up of $9 is 900 coins, and a
 * package adds its bonus coins on top. Paid with BANDCOIN, XLM or USDC in one
 * signed payment to the treasury (BANDCOIN at its live dollar price, XLM and
 * USDC at the live rate), or by card, which needs no Stellar step at all.
 *
 *   quote   what it costs right now in the chosen currency
 *   start   the order, and the payment to sign (wallet) or nothing (card)
 *   submit  sends the payment, or charges the card, then adds the coins
 *
 * No retries: a payment that fails is reported; a lost answer from Stellar is
 * settled by the worker's payment check, and a card is refunded if the coins
 * couldn't be added.
 */
type ServiceCtx = Pick<Context, "db" | "chain" | "activity">;

export type TopUpCurrency = OnChainCurrency | "USD";
export type TopUpInput = {
  currency: TopUpCurrency;
  packageId?: string | null;
  usd?: number | null;
};

/** What the order remembers, so adding the coins needs nothing from the request. */
type StudioOrder = {
  coins: number;
  bonusCoins: number;
  usd: string;
  packageId: string | null;
  label: string;
};

const usdText = (usd: number) => usd.toFixed(2);

/** The package or amount chosen, in coins and dollars. */
async function chosen(ctx: ServiceCtx, input: TopUpInput): Promise<StudioOrder> {
  if (input.packageId) {
    const pack = await ctx.db.studioPackage.findFirst({
      where: { id: input.packageId, isActive: true },
      select: { id: true, name: true, priceUsd: true, bonusCoins: true },
    });
    if (!pack)
      throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, {
        message: "That package isn't on sale anymore.",
      });
    const usd = Number(pack.priceUsd);
    return {
      coins: coinsForUsd(usd),
      bonusCoins: Math.max(0, Math.round(Number(pack.bonusCoins))),
      usd: usdText(usd),
      packageId: pack.id,
      label: pack.name,
    };
  }
  const usd = Math.round(Number(input.usd) * 100) / 100;
  if (!(usd >= MIN_TOP_UP_USD && usd <= MAX_TOP_UP_USD))
    throw new AppError(ErrorCodes.VALIDATION_FAILED, {
      message: `Top up between $${MIN_TOP_UP_USD} and $${MAX_TOP_UP_USD}.`,
    });
  return {
    coins: coinsForUsd(usd),
    bonusCoins: 0,
    usd: usdText(usd),
    packageId: null,
    label: `$${usdText(usd)} of coins`,
  };
}

export type StudioQuote = {
  currency: TopUpCurrency;
  coins: number;
  bonusCoins: number;
  usd: string;
  label: string;
  /** What leaves the wallet or the card, in `currency` */
  pay: string;
  /** The Stellar network fee, in XLM (wallet payments only) */
  networkFeeXlm: string | null;
  rateUsd: string | null;
  ok: boolean;
  problems: QuoteProblem[];
  expiresAt: string;
};

async function price(ctx: ServiceCtx, user: SessionUser, input: TopUpInput) {
  const order = await chosen(ctx, input);
  if (input.currency === "USD") {
    const quote: StudioQuote = {
      currency: "USD",
      ...order,
      pay: order.usd,
      networkFeeXlm: null,
      rateUsd: null,
      ok: true,
      problems: [],
      expiresAt: new Date(Date.now() + QUOTE_TTL_SECONDS * 1000).toISOString(),
    };
    return { quote, order, account: null };
  }

  const { chain } = ctx;
  const [account, rates, bandcoinUsd] = await Promise.all([
    chain.loadAccount(user.walletAddress),
    input.currency === "BANDCOIN" ? Promise.resolve({}) : chain.rates(),
    input.currency === "BANDCOIN" ? chain.bandcoinUsd() : Promise.resolve("1"),
  ]);
  const perBandcoin = Number(bandcoinUsd);
  if (input.currency === "BANDCOIN" && !(perBandcoin > 0))
    throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, {
      message: "BANDCOIN's price isn't available right now. Try XLM, USDC or a card.",
    });
  const bandcoin = (Number(order.usd) / perBandcoin).toFixed(7);
  const built = buildQuote({
    currency: input.currency,
    quantity: 1,
    unitPrice: { bandcoin, usd: order.usd },
    rates,
    platformFeeBps: 0,
    newTrustlines: 0,
    networkFeeXlm: networkFeeXlm(1, chain.config.network.baseFee),
    funds: account ? fundsOf(account, chain.config.assets) : null,
    now: new Date(),
  });
  const problems = [...built.problems];
  if (!account)
    problems.unshift({
      code: "UNAVAILABLE",
      message: "Your wallet needs its first XLM before it can pay. Use a card instead.",
    });
  const quote: StudioQuote = {
    currency: input.currency,
    ...order,
    pay: built.lines.find((line) => line.key === "price")?.amount ?? "0",
    networkFeeXlm: built.lines.find((line) => line.key === "networkFee")?.amount ?? null,
    rateUsd: input.currency === "BANDCOIN" ? bandcoinUsd : built.rateUsd,
    ok: problems.length === 0,
    problems,
    expiresAt: built.expiresAt,
  };
  return { quote, order, account };
}

export async function quoteTopUp(ctx: ServiceCtx, user: SessionUser, input: TopUpInput) {
  return (await price(ctx, user, input)).quote;
}

/** Creates the order and, for wallets, the payment to sign. Nothing is sent yet. */
export async function startTopUp(ctx: ServiceCtx, user: SessionUser, input: TopUpInput) {
  const { quote, order: studio, account } = await price(ctx, user, input);
  if (!quote.ok)
    throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, {
      message: quote.problems[0]?.message ?? "This can't go through right now.",
      details: { problems: quote.problems },
    });
  const card = input.currency === "USD";
  const order = await ctx.db.order.create({
    data: {
      kind: "STUDIO_COINS",
      buyerId: user.id,
      currency: input.currency,
      unitPrice: quote.pay,
      platformFee: "0",
      total: quote.pay,
      method: card ? "CARD" : "WALLET",
      quoteExpiresAt: new Date(quote.expiresAt),
      breakdown: { ...quote, studio },
      rateUsd: quote.rateUsd,
    },
  });
  ctx.activity.set({
    targetType: "Order",
    targetId: order.id,
    amount: quote.pay,
    currency: input.currency,
  });

  if (card || !account) {
    await transitionOrder(ctx.db, order.id, "AWAITING_SIGNATURE");
    return { orderId: order.id, quote, xdr: null, signer: "card" as const };
  }
  const { network, assets, treasury } = ctx.chain.config;
  const built = buildPlatformPayment({
    payer: new Account(account.accountId(), account.sequenceNumber()),
    network,
    orderId: order.id,
    to: treasury,
    asset: assetFor(input.currency as OnChainCurrency, assets),
    amount: quote.pay,
  });
  // The hash doesn't change when signatures are added, so it pins the exact transaction.
  await transitionOrder(ctx.db, order.id, "AWAITING_SIGNATURE", { txHash: built.hash });
  return {
    orderId: order.id,
    quote,
    xdr: built.xdr,
    signer: isCustodial(user) ? ("custodial" as const) : ("wallet" as const),
  };
}

/** Sends the payment (or charges the card), then adds the coins. */
export async function submitTopUp(
  ctx: ServiceCtx,
  user: SessionUser,
  input: { orderId: string; xdr?: string; card?: { sourceId: string; verificationToken?: string } },
) {
  const { chain, db } = ctx;
  const order = await ownOrder(ctx, user, input.orderId);
  if (order.kind !== "STUDIO_COINS")
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Order not found" });
  ctx.activity.set({
    targetType: "Order",
    targetId: order.id,
    amount: order.total.toString(),
    currency: order.currency,
  });
  if (order.status !== "AWAITING_SIGNATURE")
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, {
      message: `This order is already ${order.status.toLowerCase()}.`,
    });
  if (order.quoteExpiresAt && order.quoteExpiresAt < new Date()) {
    await transitionOrder(db, order.id, "FAILED", {
      failureCode: ErrorCodes.STELLAR_QUOTE_EXPIRED,
    });
    throw new AppError(ErrorCodes.STELLAR_QUOTE_EXPIRED);
  }

  if (order.method === "CARD") {
    if (!input.card)
      throw new AppError(ErrorCodes.VALIDATION_FAILED, { message: "Add a card to pay." });
    const { paymentId } = await chain.card.charge({
      orderId: order.id,
      sourceId: input.card.sourceId,
      verificationToken: input.card.verificationToken,
      cents: toCents(toStroops(order.total.toString())),
    });
    await transitionOrder(db, order.id, "SUBMITTED", { cardPaymentId: paymentId });
    try {
      return await deliverStudioCoins(ctx, order.id);
    } catch (error) {
      // The card was charged but the coins couldn't be added: refund it.
      await failOrder(ctx, order.id, error, { paymentId, total: order.total.toString() });
      throw error;
    }
  }

  if (!order.txHash)
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, { message: "This order has no payment." });
  const xdr = await userSignature(ctx, user, order.txHash, input.xdr);
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
  return deliverStudioCoins(ctx, order.id);
}

function studioOf(breakdown: unknown): StudioOrder {
  const studio = (breakdown as { studio?: StudioOrder } | null)?.studio;
  if (!studio) throw new AppError(ErrorCodes.INTERNAL, { message: "This order has no coins." });
  return studio;
}

/** Adds a paid order's coins (and any bonus). Runs once: the CONFIRMED transition guards it. */
export async function deliverStudioCoins(ctx: Pick<Context, "db">, orderId: string) {
  const delivered = await ctx.db.$transaction(async (tx) => {
    await transitionOrder(tx, orderId, "CONFIRMED");
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    if (!order.buyerId)
      throw new AppError(ErrorCodes.INTERNAL, { message: "This order has no buyer." });
    const studio = studioOf(order.breakdown);
    const paid =
      order.currency === "USD"
        ? `$${studio.usd} by card`
        : `${order.total.toString()} ${order.currency}`;
    await creditCoins(tx, {
      userId: order.buyerId,
      coins: studio.coins,
      kind: "DEPOSIT",
      note: `${studio.label}: ${paid}`,
      txHash: order.txHash,
    });
    await creditCoins(tx, {
      userId: order.buyerId,
      coins: studio.bonusCoins,
      kind: "BONUS",
      note: `${studio.label} bonus`,
    });
    await transitionOrder(tx, orderId, "DELIVERED");
    return studio;
  });
  return {
    orderId,
    status: "DELIVERED" as const,
    coins: delivered.coins + delivered.bonusCoins,
  };
}
