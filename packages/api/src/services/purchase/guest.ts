import { Account, type Horizon } from "@stellar/stellar-sdk";

import { lookupAccountForEmail } from "@actiontokens/auth/email-lookup";
import {
  buildActivation,
  networkFeeXlm,
  quoteActivation,
  toAmount,
  toCents,
  toDisplay,
  toStroops,
} from "@actiontokens/chain";
import type { Quote, QuoteLine, QuoteProblem } from "@actiontokens/chain/quote";
import { AppError, ErrorCodes, isAppError } from "@actiontokens/errors";

import type { Context, SessionUser } from "../../context";
import { transitionOrder } from "../order-state";
import { buildItemTransaction, cosignPurchase, deliverOrder, failOrder, priceSale } from "./index";
import {
  buildNftTopUp,
  ensureRegistered,
  isNftListing,
  loadNftSale,
  priceNft,
  runCardNftSteps,
} from "./nft";
import { loadSale } from "./sale";

/**
 * Guest checkout: buying by card with only an email, no sign-in.
 *
 *   quote → priced like a signed-in card buyer's, from the database only
 *           (asking the accounts service can open an account as a side
 *           effect). An email with no open Stellar account pays for opening
 *           it, on its own line.
 *   start → the order (guestEmail, no buyer yet); rate-limited
 *   pay   → claims the order, charges the card, then finds or makes the
 *           account for the email, opens it on Stellar if needed, and buys.
 *
 * Money first, account second: every failure before the account opens
 * refunds the whole charge. Once this order opened the account, a failed
 * purchase refunds the item part only; the opening XLM is in their account.
 * Contract NFTs keep their own rule: once the BANDCOIN went in, a failed
 * buy leaves it with the buyer. Nothing is retried.
 */
type ServiceCtx = Pick<Context, "db" | "chain" | "activity" | "ip">;
type GuestInput = { listingId: string; quantity: number; email: string };

const MAX_ORDERS_PER_EMAIL_HOUR = 5;
const MAX_ORDERS_PER_IP_HOUR = 10;

export type GuestBreakdown = {
  email: string;
  /** What opening the account costs (USD), when it isn't open yet */
  accountUsd: string | null;
  startingBalance: string | null;
  /** The opening part is settled: kept (this order opened the account) or already refunded */
  openingSettled?: boolean;
};

const normal = (email: string) => email.trim().toLowerCase();
const unavailable = (message: string): QuoteProblem => ({ code: "UNAVAILABLE", message });

/** A stand-in signed-in user for pricing: an email/Google/Apple account. */
const pricingUser = (account: { userId: string; walletAddress: string } | null): SessionUser => ({
  id: account?.userId ?? "guest",
  role: "FAN",
  walletAddress: account?.walletAddress ?? "",
  walletType: "emailPass",
});

/** Everything quote, start and pay agree on. */
async function priceGuest(ctx: ServiceCtx, input: GuestInput) {
  const { chain, db } = ctx;
  const email = normal(input.email);
  const existing = await lookupAccountForEmail(db, email);
  const account = existing ? await chain.loadAccount(existing.walletAddress) : null;
  const nft = await isNftListing(db, input.listingId);
  const purchase = {
    listingId: input.listingId,
    quantity: input.quantity,
    currency: "USD" as const,
  };
  const user = pricingUser(existing);

  const nftSale = nft ? await loadNftSale(db, input.listingId) : null;
  const priced = nftSale
    ? await priceNft(ctx, user, nftSale, purchase, { account })
    : await priceSale(ctx, user, await loadSale(db, input.listingId), purchase, {
        buyerAccount: account,
        settings: await db.appSetting.findUnique({ where: { id: 1 } }),
      });
  const itemId = nftSale ? nftSale.item.id : "sale" in priced ? priced.sale.item.id : null;

  const problems: QuoteProblem[] = [];
  if (existing && !existing.custodial)
    problems.push(
      unavailable("This email belongs to a wallet account. Sign in with your wallet to buy."),
    );

  // Not open on Stellar yet: this order opens it first.
  let opening: { usd: bigint; startingBalance: string } | null = null;
  if (!account) {
    const rates = await chain.rates().catch(() => null);
    const activation = quoteActivation({
      xlmUsd: rates ? toStroops(rates.xlmUsd) : 0n,
      networkFeeXlm: networkFeeXlm(1, chain.config.network.baseFee),
    });
    if (!chain.config.mother)
      problems.push(unavailable("Guest checkout isn't available right now. Sign in to buy."));
    else if (!activation.ok)
      problems.push(...activation.problems.map((p) => unavailable(p.message)));
    else
      opening = {
        usd: BigInt(activation.chargeCents) * 100_000n,
        startingBalance: activation.startingBalance,
      };
  }

  const itemUsd = toStroops(priced.quote.totals[0]?.amount ?? "0");
  const lines: QuoteLine[] = [
    ...priced.quote.lines,
    ...(opening
      ? [
          {
            key: "account" as const,
            label: "Opening your account",
            detail: `${toDisplay(toStroops(opening.startingBalance))} XLM, first time only`,
            hint: "Opens the Bandcoin account for your email on Stellar. The XLM stays yours.",
            amount: toAmount(opening.usd),
            currency: "USD" as const,
          },
        ]
      : []),
  ];
  // Signing in isn't needed here: the card pays, and the account comes from the email.
  const all = [
    ...problems,
    ...priced.quote.problems.filter((problem) => problem.code !== "SIGN_IN"),
  ];
  const quote: Quote = {
    ...priced.quote,
    lines,
    totals: [{ currency: "USD", amount: toAmount(itemUsd + (opening?.usd ?? 0n)) }],
    problems: all,
    ok: all.length === 0,
  };
  const guest: GuestBreakdown = {
    email,
    accountUsd: opening ? toAmount(opening.usd) : null,
    startingBalance: opening?.startingBalance ?? null,
  };
  return { quote, nftSale, itemId, priced, itemUsd, guest };
}

export async function quoteGuestPurchase(ctx: ServiceCtx, input: GuestInput) {
  return (await priceGuest(ctx, input)).quote;
}

/** The order for a guest: no buyer and no transaction yet (both come after the card). */
export async function startGuestPurchase(ctx: ServiceCtx, input: GuestInput) {
  const { db } = ctx;
  const email = normal(input.email);
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const [byEmail, byIp] = await Promise.all([
    db.order.count({ where: { guestEmail: email, createdAt: { gte: since } } }),
    ctx.ip
      ? db.activityLog.count({
          where: { action: "order.guestStart", ip: ctx.ip, createdAt: { gte: since } },
        })
      : 0,
  ]);
  if (byEmail >= MAX_ORDERS_PER_EMAIL_HOUR || byIp >= MAX_ORDERS_PER_IP_HOUR)
    throw new AppError(ErrorCodes.RATE_LIMITED, {
      message: "Too many checkouts in a short time. Try again in an hour, or sign in.",
    });

  const { quote, nftSale, itemId, priced, itemUsd, guest } = await priceGuest(ctx, input);
  if (!quote.ok)
    throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, {
      message: quote.problems[0]?.message ?? "This purchase can't go through right now.",
      details: { problems: quote.problems },
    });
  if (nftSale) await ensureRegistered(ctx, nftSale);

  const total = quote.totals[0]!.amount;
  const order = await db.order.create({
    data: {
      kind: nftSale ? "NFT_PURCHASE" : "ITEM_PURCHASE",
      guestEmail: email,
      listingId: input.listingId,
      itemId,
      quantity: input.quantity,
      currency: "USD",
      unitPrice: quote.unitPrice,
      platformFee: nftSale
        ? quote.payout.platform
        : (quote.lines.find((line) => line.key === "platformFee")?.amount ?? "0"),
      total,
      method: "CARD",
      quoteExpiresAt: new Date(quote.expiresAt),
      breakdown: {
        ...quote,
        guest,
        itemUsd: toAmount(itemUsd),
        ...("price" in priced
          ? {
              nft: {
                bandcoin: toAmount(priced.price.bandcoin),
                feeBandcoin: toAmount(priced.feeBandcoin),
                openTrustline: priced.openTrustline,
                reserveXlm: toAmount(priced.reserveXlm),
              },
            }
          : {}),
      },
      rateUsd: quote.rateUsd,
      sellerAmount: quote.payout.seller,
      royaltyAmount: quote.payout.royalty,
    },
  });
  ctx.activity.set({ targetType: "Order", targetId: order.id, amount: total, currency: "USD" });
  await transitionOrder(db, order.id, "AWAITING_SIGNATURE");
  return { orderId: order.id, quote };
}

/** Pays a guest order: charge, account, (open it,) buy. See the file comment for refunds. */
export async function payGuestPurchase(
  ctx: ServiceCtx,
  input: { orderId: string; email: string; card: { sourceId: string; verificationToken?: string } },
) {
  const { chain, db } = ctx;
  const email = normal(input.email);
  const order = await db.order.findUnique({ where: { id: input.orderId } });
  if (order?.guestEmail !== email || !order)
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Order not found" });
  ctx.activity.set({
    targetType: "Order",
    targetId: order.id,
    amount: order.total.toString(),
    currency: "USD",
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

  // Claim it first, so two clicks can't both charge.
  await transitionOrder(db, order.id, "SUBMITTED");
  const total = order.total.toString();
  let paymentId: string;
  try {
    ({ paymentId } = await chain.card.charge({
      orderId: order.id,
      sourceId: input.card.sourceId,
      verificationToken: input.card.verificationToken,
      cents: toCents(toStroops(total)),
    }));
  } catch (error) {
    await failOrder(ctx, order.id, error, null);
    throw error;
  }
  await db.order.update({ where: { id: order.id }, data: { cardPaymentId: paymentId } });
  const refundable = { paymentId, total };
  const breakdown = order.breakdown as { guest: GuestBreakdown; itemUsd: string };

  // Before the account is open, any failure refunds everything.
  let account: Horizon.AccountResponse;
  let walletAddress: string;
  try {
    const owner = await chain.accountForEmail(email);
    if (!owner.custodial)
      throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, {
        message: "This email belongs to a wallet account. Sign in with your wallet to buy.",
      });
    walletAddress = owner.walletAddress;
    await db.order.update({ where: { id: order.id }, data: { buyerId: owner.userId } });
    account = await openAccount(ctx, order.id, walletAddress, breakdown.guest, refundable);
  } catch (error) {
    if (!(isAppError(error) && error.code === ErrorCodes.STELLAR_TX_SUBMIT_FAILED))
      await failOrder(ctx, order.id, error, refundable);
    throw error;
  }

  if (order.kind === "NFT_PURCHASE") {
    // Step 1's top-up is built for the account as it is now (open, maybe just opened).
    const sale = await loadNftSale(db, order.listingId!);
    const purchase = {
      listingId: order.listingId!,
      quantity: order.quantity,
      currency: "USD" as const,
    };
    const priced = await priceNft(
      ctx,
      pricingUser({ userId: "guest", walletAddress }),
      sale,
      purchase,
      {
        account,
      },
    );
    const topUp = buildNftTopUp(ctx, priced, account, order.id);
    await db.order.update({ where: { id: order.id }, data: { txHash: topUp.hash } });
    return runCardNftSteps(
      ctx,
      order,
      await chain.signForCustodialUser(topUp.xdr, email),
      paymentId,
      { email, walletAddress },
    );
  }

  // Classic: priced again for the open account; it must not cost more than the item part charged.
  try {
    const sale = await loadSale(db, order.listingId!);
    const purchase = {
      listingId: order.listingId!,
      quantity: order.quantity,
      currency: "USD" as const,
    };
    const priced = await priceSale(
      ctx,
      pricingUser({ userId: "guest", walletAddress }),
      sale,
      purchase,
      {
        buyerAccount: account,
        settings: await db.appSetting.findUnique({ where: { id: 1 } }),
      },
    );
    const now = toStroops(priced.quote.totals[0]?.amount ?? "0");
    if (!priced.quote.ok || !priced.delivery || now > toStroops(breakdown.itemUsd))
      throw new AppError(ErrorCodes.STELLAR_QUOTE_EXPIRED, {
        message: "The price changed before your order went through. Nothing was bought.",
      });
    const built = buildItemTransaction(ctx, priced, account, priced.delivery, order.id);
    await db.order.update({ where: { id: order.id }, data: { txHash: built.hash } });
    const xdr = await cosignPurchase(
      ctx,
      await chain.signForCustodialUser(built.xdr, email),
      sale,
      walletAddress,
      true,
    );
    const { hash } = await chain.submit(xdr);
    ctx.activity.set({ txHash: hash });
  } catch (error) {
    // A lost response may still have landed: leave it SUBMITTED for the worker to re-check.
    if (isAppError(error) && error.code === ErrorCodes.STELLAR_TX_SUBMIT_FAILED) throw error;
    await failOrder(ctx, order.id, error, refundable);
    throw error;
  }
  return deliverOrder(ctx, order.id);
}

/**
 * The buyer's account on Stellar, opened now when it isn't yet (the mother
 * account funds it with what the card paid). Already open although the
 * quote expected otherwise: the opening part is refunded, nothing else.
 */
async function openAccount(
  ctx: ServiceCtx,
  orderId: string,
  walletAddress: string,
  guest: GuestBreakdown,
  payment: { paymentId: string; total: string },
): Promise<Horizon.AccountResponse> {
  const { chain } = ctx;
  const existing = await chain.loadAccount(walletAddress);
  if (existing) {
    if (guest.accountUsd) {
      await chain.card.refund({
        orderId,
        paymentId: payment.paymentId,
        cents: toCents(toStroops(guest.accountUsd)),
      });
      await settleOpening(ctx, orderId, guest);
      console.info("[guest] account was already open; opening part refunded", { orderId });
    }
    return existing;
  }
  const mother = chain.config.mother;
  if (!guest.startingBalance || !mother)
    throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, {
      message: "The account for this email isn't open yet. Sign in to open it first.",
    });
  const platform = await chain.loadAccount(mother);
  if (!platform) throw new AppError(ErrorCodes.STORAGE_ACCOUNT_UNAVAILABLE);
  const built = buildActivation({
    platform: new Account(platform.accountId(), platform.sequenceNumber()),
    network: chain.config.network,
    orderId,
    destination: walletAddress,
    startingBalance: guest.startingBalance,
  });
  await chain.submit(await chain.signWithServerKeys(built.xdr, [mother]));
  // From here the opening part is theirs: a later failure refunds the item part only.
  await settleOpening(ctx, orderId, guest);
  const opened = await chain.loadAccount(walletAddress);
  if (!opened) throw new AppError(ErrorCodes.STELLAR_TX_BUILD_FAILED);
  return opened;
}

/** Marks the opening part settled, so no failure refunds it (again). */
async function settleOpening(ctx: ServiceCtx, orderId: string, guest: GuestBreakdown) {
  const order = await ctx.db.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { breakdown: true },
  });
  await ctx.db.order.update({
    where: { id: orderId },
    data: {
      breakdown: { ...(order.breakdown as object), guest: { ...guest, openingSettled: true } },
    },
  });
}
