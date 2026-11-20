import { Account } from "@stellar/stellar-sdk";

import {
  assetFor,
  buildPlatformPayment,
  networkFeeXlm,
  type OnChainCurrency,
  toCents,
  toStroops,
} from "@actiontokens/chain";
import { buildQuote, type Quote, type QuoteProblem } from "@actiontokens/chain/quote";
import { fundsOf } from "@actiontokens/chain/server";
import type { Prisma } from "@actiontokens/db";
import { AppError, ErrorCodes, isAppError } from "@actiontokens/errors";
import {
  addMonths,
  normalizeVanityName,
  renewalEnd,
  validateVanityName,
  vanityTimeline,
} from "@actiontokens/utils/vanity";

import { type Context, isCustodial, type SessionUser } from "../../context";
import { transitionOrder } from "../order-state";
import { failOrder, ownOrder, userSignature } from "../purchase";

/**
 * An artist's short link, action-tokens.com/their-name.
 *
 *   claim   the first month is free, once per artist
 *   renew   a month more, paid
 *   change  a different name, one-time fee, keeps the paid-up time
 *
 * A link that isn't renewed works for 7 more days (grace), then sends visitors
 * to the artist's normal page; the name stays theirs for 30 days after that.
 * Prices are the platform's (AppSetting), in BANDCOIN or USD; XLM and USDC
 * follow the USD price at the live rate, and a card pays the USD price. The
 * platform fee (AppSetting.platformFeeBps) is added on top in every currency
 * (plan 33). Whatever state a link is in comes from its dates
 * (`vanityTimeline`), so it is right without a background job.
 */
type ServiceCtx = Pick<Context, "db" | "chain" | "activity">;
type ArtistRef = { id: string };

export type VanityPurpose = "RENEWAL" | "NAME_CHANGE";
export type VanityCurrency = OnChainCurrency | "USD";
export type VanityPayInput = { purpose: VanityPurpose; name?: string; currency: VanityCurrency };

/** What the order remembers, so delivering it needs nothing from the request. */
type VanityOrder = { organizationId: string; purpose: VanityPurpose; name: string | null };

const unavailable = (message: string): QuoteProblem => ({ code: "UNAVAILABLE", message });

export type NameCheck =
  { name: string; ok: true } | { name: string; ok: false; reason: string; mine?: boolean };

/** Whether the artist may use this name: well formed, and not held by someone else. */
export async function checkVanityName(
  ctx: Pick<ServiceCtx, "db">,
  artist: ArtistRef,
  raw: string,
): Promise<NameCheck> {
  const name = normalizeVanityName(raw);
  const invalid = validateVanityName(name);
  if (invalid) return { name, ok: false, reason: invalid };

  const holder = await ctx.db.vanityUrl.findUnique({ where: { name } });
  if (!holder) return { name, ok: true };
  if (holder.organizationId === artist.id) return { name, ok: true };
  // Another artist's link that ran out and is past its reserved days is free again.
  if (vanityTimeline(holder, new Date()).heldUntil < new Date()) return { name, ok: true };
  return { name, ok: false, reason: "That name is taken" };
}

/** The artist's link, where it stands, and what each step costs. */
export async function getVanity(ctx: Pick<ServiceCtx, "db">, artist: ArtistRef) {
  const [link, trialUsed, settings, payments] = await Promise.all([
    ctx.db.vanityUrl.findUnique({ where: { organizationId: artist.id } }),
    ctx.db.vanityPayment.findFirst({ where: { organizationId: artist.id, kind: "FREE_TRIAL" } }),
    ctx.db.appSetting.findUnique({ where: { id: 1 } }),
    ctx.db.vanityPayment.findMany({
      where: { organizationId: artist.id },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        id: true,
        kind: true,
        currency: true,
        amount: true,
        periodEnd: true,
        createdAt: true,
      },
    }),
  ]);
  const timeline = link ? vanityTimeline(link, new Date()) : null;
  return {
    link: link && timeline ? { name: link.name, ...timeline } : null,
    /** The free month is gone once used, even after the name was released */
    canClaimFree: !link && !trialUsed,
    prices: {
      monthly: {
        bandcoin: settings?.vanityMonthlyBandcoin?.toString() ?? null,
        usd: settings?.vanityMonthlyUsd?.toString() ?? null,
      },
      nameChange: {
        bandcoin: settings?.vanityNameChangeBandcoin?.toString() ?? null,
        usd: settings?.vanityNameChangeUsd?.toString() ?? null,
      },
    },
    payments: payments.map((payment) => ({ ...payment, amount: payment.amount.toString() })),
  };
}

/** Gives the artist this name for a free first month. */
export async function claimVanity(ctx: ServiceCtx, artist: ArtistRef, raw: string) {
  const checked = await checkVanityName(ctx, artist, raw);
  if (!checked.ok) throw new AppError(ErrorCodes.VALIDATION_FAILED, { message: checked.reason });
  const { name } = checked;

  const [existing, trialUsed] = await Promise.all([
    ctx.db.vanityUrl.findUnique({ where: { organizationId: artist.id } }),
    ctx.db.vanityPayment.findFirst({ where: { organizationId: artist.id, kind: "FREE_TRIAL" } }),
  ]);
  if (existing)
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, { message: "You already have a link." });
  if (trialUsed)
    throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, {
      message: "Your free month was already used. Pay for a month to get a link again.",
    });

  const paidUntil = addMonths(new Date(), 1);
  try {
    await ctx.db.$transaction(async (tx) => {
      await releaseStaleHolder(tx, name);
      await tx.vanityUrl.create({
        data: { organizationId: artist.id, name, status: "TRIAL", paidUntil },
      });
      await tx.vanityPayment.create({
        data: {
          organizationId: artist.id,
          kind: "FREE_TRIAL",
          currency: "BANDCOIN",
          amount: "0",
          periodEnd: paidUntil,
        },
      });
    });
  } catch (error) {
    throw takenOr(error);
  }
  ctx.activity.set({ targetType: "VanityUrl", targetId: artist.id });
  return { name, paidUntil };
}

/** The platform's price for this step in the chosen currency, or why it can't be paid yet. */
async function price(
  ctx: ServiceCtx,
  user: SessionUser | null,
  artist: ArtistRef,
  input: VanityPayInput,
) {
  const { chain, db } = ctx;
  const problems: QuoteProblem[] = [];
  const [link, settings, account] = await Promise.all([
    db.vanityUrl.findUnique({ where: { organizationId: artist.id } }),
    db.appSetting.findUnique({ where: { id: 1 } }),
    user ? chain.loadAccount(user.walletAddress) : null,
  ]);
  const timeline = link ? vanityTimeline(link, new Date()) : null;
  const card = input.currency === "USD";

  let name: string | null = null;
  if (input.purpose === "RENEWAL") {
    if (link) name = link.name;
    else {
      const checked = await checkVanityName(ctx, artist, input.name ?? "");
      if (checked.ok) name = checked.name;
      else problems.push(unavailable(checked.reason));
    }
  } else if (!link || !timeline?.works) {
    problems.push(unavailable("You need a working link before you can change its name."));
  } else {
    const checked = await checkVanityName(ctx, artist, input.name ?? "");
    if (!checked.ok) problems.push(unavailable(checked.reason));
    else if (checked.name === link.name) problems.push(unavailable("That is already your link."));
    else name = checked.name;
  }

  const unit =
    input.purpose === "RENEWAL"
      ? { bandcoin: settings?.vanityMonthlyBandcoin, usd: settings?.vanityMonthlyUsd }
      : { bandcoin: settings?.vanityNameChangeBandcoin, usd: settings?.vanityNameChangeUsd };
  if (!unit.bandcoin || !unit.usd) problems.push(unavailable("Link prices aren't set yet."));

  const { network, assets } = chain.config;
  const quote = buildQuote({
    currency: input.currency,
    quantity: 1,
    unitPrice: { bandcoin: unit.bandcoin?.toString() ?? "0", usd: unit.usd?.toString() ?? "0" },
    rates: input.currency === "BANDCOIN" ? {} : await chain.rates(),
    platformFeeBps: settings?.platformFeeBps ?? 0,
    newTrustlines: 0,
    // A card has nothing to send on Stellar.
    networkFeeXlm: card ? "0" : networkFeeXlm(1, network.baseFee),
    funds: user ? fundsOf(account, assets) : null,
    now: new Date(),
  });
  if (user && !account && !card)
    problems.push(unavailable("Your wallet needs its first XLM before it can pay."));

  const all = [...problems, ...quote.problems];
  return {
    quote: relabel(quote, input.purpose, all),
    account,
    name,
    purpose: input.purpose,
    periodEnd:
      input.purpose === "RENEWAL" ? renewalEnd(link?.paidUntil ?? new Date(0), new Date()) : null,
  };
}

/** The shared quote speaks of items; this is a link, so the lines say so. A card has no network fee. */
function relabel(quote: Quote, purpose: VanityPurpose, problems: QuoteProblem[]) {
  const lines = quote.lines
    .filter((line) => !(line.key === "networkFee" && quote.currency === "USD"))
    .map((line) =>
      line.key === "price"
        ? {
            ...line,
            label: purpose === "RENEWAL" ? "One more month" : "Change the name",
            detail: undefined,
          }
        : line,
    );
  return { ...quote, lines, problems, ok: problems.length === 0 };
}

export async function quoteVanity(
  ctx: ServiceCtx,
  user: SessionUser,
  artist: ArtistRef,
  input: VanityPayInput,
) {
  const { quote, name, periodEnd } = await price(ctx, user, artist, input);
  return { ...quote, name, periodEnd };
}

/** Creates the order and the payment the artist signs. Nothing is sent yet. */
export async function startVanity(
  ctx: ServiceCtx,
  user: SessionUser,
  artist: ArtistRef,
  input: VanityPayInput,
) {
  const priced = await price(ctx, user, artist, input);
  const { quote, account, name } = priced;
  const card = input.currency === "USD";
  if (!quote.ok || (!account && !card)) {
    throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, {
      message: quote.problems[0]?.message ?? "This can't go through right now.",
      details: { problems: quote.problems },
    });
  }

  const linePrice = quote.lines.find((line) => line.key === "price")?.amount ?? "0";
  const fee = quote.lines.find((line) => line.key === "platformFee")?.amount ?? "0";
  // Price and fee go to the treasury together, in the chosen currency.
  const amount =
    quote.totals.find((total) => total.currency === input.currency)?.amount ?? linePrice;
  const vanity: VanityOrder = { organizationId: artist.id, purpose: input.purpose, name };
  const order = await ctx.db.order.create({
    data: {
      kind: "VANITY",
      buyerId: user.id,
      currency: input.currency,
      unitPrice: linePrice,
      platformFee: fee,
      total: amount,
      method: card ? "CARD" : "WALLET",
      quoteExpiresAt: new Date(quote.expiresAt),
      breakdown: { ...quote, vanity },
      rateUsd: quote.rateUsd,
    },
  });
  ctx.activity.set({ targetType: "Order", targetId: order.id, amount, currency: input.currency });

  if (card || !account) {
    // A card has nothing to sign: the form charges it on submit.
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
    amount,
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

/** Sends the payment (or charges the card), then gives the artist what they paid for. */
export async function submitVanity(
  ctx: ServiceCtx,
  user: SessionUser,
  input: { orderId: string; xdr?: string; card?: { sourceId: string; verificationToken?: string } },
) {
  const { chain, db } = ctx;
  const order = await ownOrder(ctx, user, input.orderId);
  if (order.kind !== "VANITY")
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Order not found" });
  ctx.activity.set({
    targetType: "Order",
    targetId: order.id,
    amount: order.total.toString(),
    currency: order.currency,
  });
  const card = order.method === "CARD";
  if (order.status !== "AWAITING_SIGNATURE" || (!card && !order.txHash))
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, {
      message: `This order is already ${order.status.toLowerCase()}.`,
    });
  if (order.quoteExpiresAt && order.quoteExpiresAt < new Date()) {
    await transitionOrder(db, order.id, "FAILED", {
      failureCode: ErrorCodes.STELLAR_QUOTE_EXPIRED,
    });
    throw new AppError(ErrorCodes.STELLAR_QUOTE_EXPIRED);
  }
  const vanity = vanityOf(order.breakdown);
  // Someone may have taken the name since the price was shown: find out before any money moves.
  if (vanity.name) {
    const checked = await checkVanityName(ctx, { id: vanity.organizationId }, vanity.name);
    if (!checked.ok) {
      await transitionOrder(db, order.id, "CANCELED");
      throw new AppError(ErrorCodes.RESOURCE_CONFLICT, { message: checked.reason });
    }
  }

  if (card) {
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
      return await deliverVanity(ctx, order.id);
    } catch (error) {
      // Charged, but the link couldn't be updated: refund the card.
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
  return deliverVanity(ctx, order.id);
}

/** Applies a paid order to the artist's link. Runs once: the CONFIRMED transition guards it. */
export async function deliverVanity(ctx: ServiceCtx, orderId: string) {
  const now = new Date();
  let name: string;
  try {
    name = await ctx.db.$transaction(async (tx) => {
      await transitionOrder(tx, orderId, "CONFIRMED");
      const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
      const vanity = vanityOf(order.breakdown);
      const link = await tx.vanityUrl.findUnique({ where: { organizationId: vanity.organizationId } });
      let paidUntil = link?.paidUntil ?? now;

      if (vanity.purpose === "NAME_CHANGE") {
        if (!link || !vanity.name)
          throw new AppError(ErrorCodes.INTERNAL, { message: "This order has no link to change." });
        await releaseStaleHolder(tx, vanity.name);
        await tx.vanityUrl.update({
          where: { organizationId: link.organizationId },
          data: { name: vanity.name },
        });
      } else {
        paidUntil = renewalEnd(link?.paidUntil ?? now, now);
        const kept = link?.name ?? vanity.name;
        if (!kept) throw new AppError(ErrorCodes.INTERNAL, { message: "This order has no name." });
        if (link) {
          await tx.vanityUrl.update({
            where: { organizationId: link.organizationId },
            data: { status: "ACTIVE", paidUntil },
          });
        } else {
          await releaseStaleHolder(tx, kept);
          await tx.vanityUrl.create({
            data: { organizationId: vanity.organizationId, name: kept, status: "ACTIVE", paidUntil },
          });
        }
      }
      await tx.vanityPayment.create({
        data: {
          organizationId: vanity.organizationId,
          kind: vanity.purpose,
          currency: order.currency,
          amount: order.total,
          orderId: order.id,
          periodEnd: paidUntil,
        },
      });
      await transitionOrder(tx, orderId, "DELIVERED");
      return link?.name ?? vanity.name ?? "";
    });
  } catch (error) {
    throw takenOr(error);
  }
  return { orderId, status: "DELIVERED" as const, name };
}

/** Frees a name whose owner let it run out and whose reserved days are over. */
async function releaseStaleHolder(tx: Pick<Prisma.TransactionClient, "vanityUrl">, name: string) {
  const holder = await tx.vanityUrl.findUnique({ where: { name } });
  if (holder && vanityTimeline(holder, new Date()).heldUntil < new Date())
    await tx.vanityUrl.delete({ where: { organizationId: holder.organizationId } });
}

/** A unique-name clash (someone won the race) reads as "taken", not as a crash. */
function takenOr(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002"
    ? new AppError(ErrorCodes.RESOURCE_CONFLICT, { message: "That name is taken" })
    : error;
}

function vanityOf(breakdown: unknown): VanityOrder {
  const vanity = (breakdown as { vanity?: VanityOrder } | null)?.vanity;
  if (!vanity)
    throw new AppError(ErrorCodes.INTERNAL, { message: "This order has no link details." });
  return vanity;
}

/**
 * Who answers at action-tokens.com/name. A working link (including its grace days)
 * shows the artist's page under that address; a lapsed one sends visitors to
 * the page's normal address; an unknown name is nothing.
 */
export async function resolveVanity(ctx: Pick<ServiceCtx, "db">, raw: string) {
  const name = normalizeVanityName(raw);
  const link = await ctx.db.vanityUrl.findUnique({
    where: { name },
    select: { status: true, paidUntil: true, organization: { select: { slug: true, status: true } } },
  });
  if (link?.organization.status !== "APPROVED") return null;
  return { slug: link.organization.slug, works: vanityTimeline(link, new Date()).works };
}

export type VanityOverview = Awaited<ReturnType<typeof getVanity>>;
