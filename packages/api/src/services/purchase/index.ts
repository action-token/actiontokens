import { Account, type Asset, type Horizon, TransactionBuilder } from "@stellar/stellar-sdk";

import {
  assetFor,
  buildClassicPurchase,
  classicPurchaseOperations,
  type Currency,
  type OnChainCurrency,
  networkFeeXlm,
  toCents,
  toStroops,
  verifyTransaction,
  wrapInFeeBump,
} from "@bandcoin/chain";
import { buildQuote, type Quote, type QuoteProblem } from "@bandcoin/chain/quote";
import { fundsOf } from "@bandcoin/chain/server";
import { AppError, ErrorCodes, isAppError } from "@bandcoin/errors";

import { type Context, isCustodial, type SessionUser } from "../../context";
import { transitionOrder } from "../order-state";
import { loadSale, planDelivery, type Sale } from "./sale";

/**
 * Buying an item, from price to delivery. Every step is one call from the buy
 * panel:
 *
 *   quote  → the breakdown (no order yet; refreshes as the buyer changes currency or quantity)
 *   start  → creates the order and the transaction the buyer signs
 *   submit → server keys co-sign, the card is charged if paying by card, the
 *            transaction is submitted and the copies are delivered
 *   cancel → the custodial countdown's Cancel (or a closed wallet popup)
 *   confirm → the worker re-checks orders whose submit result was lost
 *
 * No conversion anywhere: the buyer pays in the currency they chose or not at all.
 * Card orders: the card pays everything in USD, including the XLM costs; the
 * treasury sends that XLM, pays the network fee (fee bump) and pays the seller
 * in BANDCOIN at the artist's BANDCOIN price, all in the same transaction.
 */

type PurchaseInput = { listingId: string; quantity: number; currency: Currency };
type ServiceCtx = Pick<Context, "db" | "chain" | "activity">;

const DEFAULT_FEE_BPS = 250;

export async function quotePurchase(
  ctx: ServiceCtx,
  user: SessionUser | null,
  input: PurchaseInput,
) {
  // Everything that doesn't depend on the listing loads alongside it.
  const [sale, buyerAccount, settings] = await Promise.all([
    loadSale(ctx.db, input.listingId),
    user ? ctx.chain.loadAccount(user.walletAddress) : null,
    ctx.db.appSetting.findUnique({ where: { id: 1 } }),
  ]);
  return priceSale(ctx, user, sale, input, { buyerAccount, settings });
}

async function priceSale(
  ctx: ServiceCtx,
  user: SessionUser | null,
  sale: Sale,
  input: PurchaseInput,
  loaded: {
    buyerAccount: Horizon.AccountResponse | null;
    settings: { platformFeeBps: number; platformFeeRecipient: string | null } | null;
  },
) {
  const { chain } = ctx;
  const { buyerAccount, settings } = loaded;
  const [stockAccount, sellerAccount] = await Promise.all([
    sale.stockAccount ? chain.loadAccount(sale.stockAccount) : null,
    chain.loadAccount(sale.seller),
  ]);
  const extraProblems: QuoteProblem[] = [];

  if (user?.id === sale.listing.sellerId) {
    extraProblems.push({ code: "UNAVAILABLE", message: "This is your own listing." });
  }
  if (sale.remaining !== null && input.quantity > sale.remaining) {
    extraProblems.push({
      code: "UNAVAILABLE",
      message: sale.remaining === 0 ? "Sold out." : `Only ${sale.remaining} left.`,
    });
  }
  const card = input.currency === "USD";
  const payoutAsset = assetFor(
    input.currency === "USD" ? "BANDCOIN" : input.currency,
    chain.config.assets,
  );
  if (!(sellerAccount && holdsLine(sellerAccount, payoutAsset))) {
    extraProblems.push({
      code: "UNAVAILABLE",
      message: card
        ? "The seller can't receive card payments yet."
        : `The seller can't receive ${input.currency} yet.`,
    });
  }

  const openTrustline = !(buyerAccount && holdsLine(buyerAccount, sale.asset));
  const royaltyBps =
    sale.listing.kind === "RESALE" && sale.creator
      ? Number(sale.item.royaltyPercent ?? 0) * 100
      : 0;
  let delivery: ReturnType<typeof planDelivery> | null = null;
  try {
    delivery = planDelivery({
      kind: sale.listing.kind,
      quantity: input.quantity,
      stockAccount: sale.stockAccount,
      stockBalance: stockAccount ? balanceOf(stockAccount, sale.asset) : "0",
      minter: sale.minter,
    });
  } catch (error) {
    if (!isAppError(error)) throw error;
    extraProblems.push({ code: "UNAVAILABLE", message: error.message });
  }

  const operations = classicPurchaseOperations({
    card,
    openTrustline,
    royalty: royaltyBps > 0,
    fromStock: Boolean(delivery?.fromStock),
    mint: Boolean(delivery?.mint),
  });
  const needsRate = input.currency !== "BANDCOIN";
  const quote = buildQuote({
    currency: input.currency,
    quantity: input.quantity,
    unitPrice: {
      bandcoin: sale.listing.priceBandcoin.toString(),
      usd: sale.listing.priceUsd.toString(),
    },
    rates: needsRate ? await chain.rates() : {},
    platformFeeBps: settings?.platformFeeBps ?? DEFAULT_FEE_BPS,
    royaltyBps: Math.round(royaltyBps),
    newTrustlines: Number(openTrustline),
    networkFeeXlm: networkFeeXlm(operations, chain.config.network.baseFee),
    funds: user ? fundsOf(buyerAccount, chain.config.assets) : null,
    now: new Date(),
  });

  const problems = [...extraProblems, ...quote.problems];
  return {
    quote: { ...quote, problems, ok: problems.length === 0 } satisfies Quote,
    sale,
    buyerAccount,
    delivery,
    openTrustline,
    feeRecipient: settings?.platformFeeRecipient ?? chain.config.treasury,
  };
}

/** Creates the order and the unsigned transaction. Nothing is signed or charged yet. */
export async function startPurchase(ctx: ServiceCtx, user: SessionUser, input: PurchaseInput) {
  const priced = await quotePurchase(ctx, user, input);
  const { quote, sale, buyerAccount, delivery } = priced;
  if (!quote.ok || !buyerAccount || !delivery) {
    throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, {
      message: quote.problems[0]?.message ?? "This purchase can't go through right now.",
      details: { problems: quote.problems },
    });
  }

  const mainTotal = quote.totals.find((total) => total.currency === quote.currency)?.amount ?? "0";
  const fee = quote.lines.find((line) => line.key === "platformFee")?.amount ?? "0";
  const order = await ctx.db.order.create({
    data: {
      kind: "ITEM_PURCHASE",
      buyerId: user.id,
      listingId: sale.listing.id,
      itemId: sale.item.id,
      quantity: input.quantity,
      currency: input.currency,
      unitPrice: quote.unitPrice,
      platformFee: fee,
      total: mainTotal,
      method: input.currency === "USD" ? "CARD" : "WALLET",
      quoteExpiresAt: new Date(quote.expiresAt),
      breakdown: quote,
      rateUsd: quote.rateUsd,
      sellerAmount: quote.payout.seller,
      royaltyAmount: quote.payout.royalty,
    },
  });
  ctx.activity.set({
    targetType: "Order",
    targetId: order.id,
    amount: mainTotal,
    currency: input.currency,
  });

  const built = buildClassicPurchase({
    buyer: new Account(buyerAccount.accountId(), buyerAccount.sequenceNumber()),
    network: ctx.chain.config.network,
    orderId: order.id,
    item: sale.asset,
    openTrustline: priced.openTrustline,
    ...payoutsFor(
      quote,
      sale,
      { treasury: ctx.chain.config.treasury, feeRecipient: priced.feeRecipient },
      ctx.chain.config.assets,
    ),
    delivery,
  });

  // The hash doesn't change when signatures are added, so it pins the exact transaction.
  await transitionOrder(ctx.db, order.id, "AWAITING_SIGNATURE", { txHash: built.hash });
  return {
    orderId: order.id,
    quote,
    xdr: built.xdr,
    /** Custodial buyers get the cancellable countdown; wallet users sign in their wallet */
    signer: isCustodial(user) ? ("custodial" as const) : ("wallet" as const),
  };
}

export async function cancelPurchase(ctx: ServiceCtx, user: SessionUser, orderId: string) {
  await ownOrder(ctx, user, orderId);
  ctx.activity.set({ targetType: "Order", targetId: orderId });
  await transitionOrder(ctx.db, orderId, "CANCELED");
  return { orderId, status: "CANCELED" as const };
}

/**
 * Sends the purchase. `xdr` is the transaction from `start`: signed by the
 * wallet for wallet users, unsigned for custodial users (the server signs only
 * now, after the countdown ran out without Cancel). Card orders pass the
 * Square card token; the card is charged before anything is submitted.
 */
export async function submitPurchase(
  ctx: ServiceCtx,
  user: SessionUser,
  input: { orderId: string; xdr?: string; card?: { sourceId: string; verificationToken?: string } },
) {
  const { chain, db } = ctx;
  const order = await ownOrder(ctx, user, input.orderId);
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

  let xdr = await userSignature(ctx, user, order.txHash, input.xdr);
  const sale = await loadSale(db, order.listingId!);
  const card = order.method === "CARD";
  const platformKeys = [sale.stockAccount, sale.minter, card ? chain.config.treasury : null];
  xdr = await chain.signWithServerKeys(
    xdr,
    serverSignersOf(xdr, chain.config.network.passphrase, user.walletAddress, platformKeys),
  );
  if (card) {
    xdr = await chain.signWithServerKeys(
      wrapInFeeBump(xdr, chain.config.treasury, chain.config.network),
      [chain.config.treasury],
    );
  }

  let cardPaymentId: string | null = null;
  if (card) {
    if (!input.card)
      throw new AppError(ErrorCodes.VALIDATION_FAILED, { message: "Add a card to pay." });
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

/** Worker reconciliation: settles a SUBMITTED order from what Horizon says happened. */
export async function confirmPurchase(ctx: ServiceCtx, orderId: string) {
  const order = await ctx.db.order.findUnique({ where: { id: orderId }, include: { buyer: true } });
  if (!order?.txHash || order.status !== "SUBMITTED" || !order.buyer?.walletAddress)
    return { status: order?.status ?? null };

  const found = await ctx.chain.findTransaction(order.txHash);
  if (!found) return { status: order.status };
  if (!found.successful) {
    await failOrder(ctx, order.id, new AppError(ErrorCodes.STELLAR_TX_REJECTED), null);
    return { status: "FAILED" as const };
  }
  const check = verifyTransaction(found.envelopeXdr, ctx.chain.config.network.passphrase, {
    source: order.buyer.walletAddress,
    memo: order.id,
    payments: [],
  });
  if (!check.ok) {
    await failOrder(
      ctx,
      order.id,
      new AppError(ErrorCodes.STELLAR_TX_REJECTED, { details: check }),
      null,
    );
    return { status: "FAILED" as const };
  }
  return deliverOrder(ctx, order.id);
}

/** Records what the buyer now owns. Runs once: the CONFIRMED transition guards it. */
export async function deliverOrder(ctx: ServiceCtx, orderId: string) {
  await ctx.db.$transaction(async (tx) => {
    await transitionOrder(tx, orderId, "CONFIRMED");
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    if (order.buyerId && order.itemId) {
      await tx.ownership.upsert({
        where: { userId_itemId: { userId: order.buyerId, itemId: order.itemId } },
        create: {
          userId: order.buyerId,
          itemId: order.itemId,
          quantity: order.quantity,
          source: "PURCHASE",
        },
        update: { quantity: { increment: order.quantity } },
      });
    }
    if (order.listingId) {
      const listing = await tx.listing.update({
        where: { id: order.listingId },
        data: { quantitySold: { increment: order.quantity } },
        include: { item: { select: { supply: true } } },
      });
      const cap = listing.quantity ?? listing.item.supply;
      if (cap !== null && listing.quantitySold >= cap) {
        await tx.listing.update({ where: { id: listing.id }, data: { status: "SOLD_OUT" } });
      }
    }
    await transitionOrder(tx, orderId, "DELIVERED");
  });
  return { orderId, status: "DELIVERED" as const };
}

export async function failOrder(
  ctx: ServiceCtx,
  orderId: string,
  error: unknown,
  card: { paymentId: string; total: string } | null,
) {
  const failureCode = isAppError(error) ? error.code : ErrorCodes.INTERNAL;
  await transitionOrder(ctx.db, orderId, "FAILED", { failureCode });
  if (!card) return;
  try {
    await ctx.chain.card.refund({
      orderId,
      paymentId: card.paymentId,
      cents: toCents(toStroops(card.total)),
    });
    await transitionOrder(ctx.db, orderId, "REFUNDED");
  } catch (refundError) {
    console.error("[purchase] card refund failed; refund by hand", {
      orderId,
      paymentId: card.paymentId,
      refundError,
    });
  }
}

export async function ownOrder(ctx: ServiceCtx, user: SessionUser, orderId: string) {
  const order = await ctx.db.order.findUnique({ where: { id: orderId } });
  if (!order || order.buyerId !== user.id)
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Order not found" });
  return order;
}

/**
 * The buyer's signature on the transaction from `start`: their wallet's, or,
 * for a custodial account, the server's (the countdown ran out without Cancel).
 */
export async function userSignature(
  ctx: ServiceCtx,
  user: SessionUser,
  txHash: string,
  xdr: string | undefined,
) {
  if (!xdr)
    throw new AppError(ErrorCodes.VALIDATION_FAILED, {
      message: "Missing the transaction to send.",
    });
  assertSameTransaction(xdr, txHash, ctx.chain.config.network.passphrase);
  if (!isCustodial(user)) return xdr;
  if (!user.email) throw new AppError(ErrorCodes.WALLET_NOT_CONNECTED);
  return ctx.chain.signForCustodialUser(xdr, user.email);
}

/** The submitted XDR must be the exact transaction `start` built for this order. */
export function assertSameTransaction(xdr: string, txHash: string, passphrase: string) {
  const hash = Buffer.from(TransactionBuilder.fromXDR(xdr, passphrase).hash()).toString("hex");
  if (hash !== txHash) {
    throw new AppError(ErrorCodes.VALIDATION_FAILED, {
      message: "That transaction doesn't belong to this order.",
    });
  }
}

/**
 * Who pays whom. Wallet orders: the buyer pays seller, fee and royalty in the
 * chosen currency. Card orders: the treasury pays the seller and royalty in
 * BANDCOIN and tops up the reserve; the platform fee stays with the card charge.
 */
function payoutsFor(
  quote: Quote,
  sale: Sale,
  platform: { treasury: string; feeRecipient: string },
  assets: Parameters<typeof assetFor>[1],
): Pick<Parameters<typeof buildClassicPurchase>[0], "payment" | "topUp"> {
  const royaltyTo = (amount: string) =>
    sale.creator && toStroops(amount) > 0n ? { royalty: { to: sale.creator, amount } } : {};
  const settlement = quote.cardSettlement;
  if (!settlement) {
    return {
      payment: {
        asset: assetFor(quote.currency as OnChainCurrency, assets),
        seller: { to: sale.seller, amount: quote.payout.seller },
        platformFee: { to: platform.feeRecipient, amount: quote.payout.platform },
        ...royaltyTo(quote.payout.royalty),
      },
    };
  }
  return {
    payment: {
      asset: assetFor("BANDCOIN", assets),
      from: platform.treasury,
      seller: { to: sale.seller, amount: settlement.seller },
      ...royaltyTo(settlement.royalty),
    },
    ...(toStroops(settlement.reserveXlm) > 0n
      ? { topUp: { from: platform.treasury, amount: settlement.reserveXlm } }
      : {}),
  };
}

/** Platform keys this transaction needs: the operation sources that aren't the buyer. */
function serverSignersOf(
  xdr: string,
  passphrase: string,
  buyer: string,
  platformKeys: (string | null)[],
) {
  const tx = TransactionBuilder.fromXDR(xdr, passphrase);
  const sources = "operations" in tx ? tx.operations.map((op) => op.source).filter(Boolean) : [];
  const allowed = new Set(platformKeys.filter(Boolean));
  return [...new Set(sources as string[])].filter(
    (source) => source !== buyer && allowed.has(source),
  );
}

export const holdsLine = (account: Horizon.AccountResponse, asset: Asset) =>
  asset.isNative() ||
  account.balances.some(
    (balance) =>
      "asset_code" in balance &&
      balance.asset_code === asset.getCode() &&
      balance.asset_issuer === asset.getIssuer(),
  );

export function balanceOf(account: Horizon.AccountResponse, asset: Asset) {
  const line = account.balances.find(
    (balance) =>
      "asset_code" in balance &&
      balance.asset_code === asset.getCode() &&
      balance.asset_issuer === asset.getIssuer(),
  );
  return line?.balance ?? "0";
}
