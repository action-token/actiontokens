import { Account, Asset } from "@stellar/stellar-sdk";

import {
  assetFor,
  buildTopUp,
  buildTrustByCard,
  buildTrustWithPayment,
  networkFeeXlm,
  quoteFanTokenTrust,
  quoteTopUp,
  signersNeeded,
  toCents,
  toStroops,
  type TrustCurrency,
  wrapInFeeBump,
} from "@actiontokens/chain";
import { QUOTE_TTL_SECONDS } from "@actiontokens/chain/quote";
import { fundsOf } from "@actiontokens/chain/server";
import { AppError, ErrorCodes, isAppError } from "@actiontokens/errors";

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
 * Separate things, never one triggering the other:
 *   TOP_UP    card → BANDCOIN from the mother account
 *   TOKEN_TRUST  subscribing: the fan-token line, paid in BANDCOIN, USDC, XLM or by
 *             card (plan 33, chain's quoteFanTokenTrust), opened in one transaction
 * Swapping BANDCOIN and XLM is the wallet's Swap (services/wallet/swap).
 */

export type RechargeInput =
  | { kind: "TOP_UP"; packageUsd: string }
  | { kind: "TOKEN_TRUST"; artistId: string; currency: TrustCurrency };
type ServiceCtx = Pick<Context, "db" | "chain" | "activity">;

async function priceRecharge(ctx: ServiceCtx, user: SessionUser | null, input: RechargeInput) {
  const { chain } = ctx;
  const [bandcoinUsd, rates, account, settings] = await Promise.all([
    chain.bandcoinUsd().catch(rateFailure),
    chain.rates().catch(rateFailure),
    user ? chain.loadAccount(user.walletAddress) : null,
    ctx.db.appSetting.findUnique({ where: { id: 1 }, select: { platformFeeBps: true } }),
  ]);
  const funds = user ? fundsOf(account, chain.config.assets) : null;
  const asset = assetFor("BANDCOIN", chain.config.assets);
  const rate =
    bandcoinUsd && rates
      ? { bandcoinUsd: toStroops(bandcoinUsd), xlmUsd: toStroops(rates.xlmUsd) }
      : { bandcoinUsd: 0n, xlmUsd: 0n };
  const { baseFee } = chain.config.network;

  const openTrustline = !(account && holdsLine(account, asset));
  const token = input.kind === "TOKEN_TRUST" ? await fanTokenOf(ctx, input.artistId) : null;
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
          kind: "TOKEN_TRUST" as const,
          token: token
            ? { code: token.code, artistName: token.artistName, artistId: input.artistId }
            : null,
          ...quoteFanTokenTrust({
            currency: input.currency,
            ...rate,
            usdcUsd: rates ? toStroops(rates.usdcUsd) : 0n,
            feeBps: settings?.platformFeeBps ?? 0,
            networkFeeXlm: networkFeeXlm(trustOperations(input.currency, openTrustline), baseFee),
            funds: funds ? { BANDCOIN: funds.BANDCOIN, USDC: funds.USDC, XLM: funds.XLM } : null,
            hasBandcoinLine: !openTrustline,
          }),
        };

  const extra: { code: "UNAVAILABLE"; message: string }[] = [];
  if (input.kind === "TOKEN_TRUST") {
    if (!token)
      extra.push({ code: "UNAVAILABLE", message: "This artist has no fan token to hold." });
    else if (account && holdsLine(account, new Asset(token.code, token.issuer)))
      extra.push({ code: "UNAVAILABLE", message: `You already hold ${token.code}.` });
  }
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
    token,
  };
}

/**
 * Operations in a Subscribe transaction, for its network fee: BANDCOIN/USDC pay,
 * fee, XLM, line; XLM fee, line; card XLM, line, BANDCOIN (+ its line) and the fee bump.
 */
function trustOperations(currency: TrustCurrency, noBandcoinLine: boolean) {
  if (currency === "XLM") return 2;
  if (currency === "USD") return 4 + Number(noBandcoinLine);
  return 4;
}

/** The artist's fan token, if they have one on Stellar that Bandcoin issued or tracks. */
async function fanTokenOf(ctx: Pick<ServiceCtx, "db">, artistId: string) {
  const artist = await ctx.db.artist.findFirst({
    where: { id: artistId, status: "APPROVED" },
    select: {
      name: true,
      fanTokenItem: { select: { classicToken: { select: { code: true, issuer: true } } } },
    },
  });
  const line = artist?.fanTokenItem?.classicToken;
  return line ? { code: line.code, issuer: line.issuer, artistName: artist.name } : null;
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

  const card = quote.kind === "TOP_UP" || quote.currency === "USD";
  const total = quote.kind === "TOP_UP" ? input.kind === "TOP_UP" && input.packageUsd : quote.total;
  const currency = quote.kind === "TOP_UP" ? "USD" : quote.currency;
  if (quote.kind === "TOKEN_TRUST" && !priced.token)
    throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, {
      message: "This artist has no fan token to hold.",
    });
  const order = await ctx.db.order.create({
    data: {
      kind: quote.kind === "TOP_UP" ? "RECHARGE" : "TOKEN_TRUST",
      buyerId: user.id,
      currency,
      unitPrice: total as string,
      platformFee: quote.kind === "TOKEN_TRUST" ? quote.fee : "0",
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
    currency,
  });

  const { network, assets, treasury } = ctx.chain.config;
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
      : quote.currency === "USD"
        ? buildTrustByCard({
            buyer,
            network,
            orderId: order.id,
            token: new Asset(priced.token!.code, priced.token!.issuer),
            from: mother,
            sendXlm: quote.sendXlm,
            bandcoin: {
              asset,
              amount: quote.card?.extraBandcoin ?? "0",
              openLine: quote.card?.openBandcoinLine ?? false,
            },
          })
        : buildTrustWithPayment({
            buyer,
            network,
            orderId: order.id,
            token: new Asset(priced.token!.code, priced.token!.issuer),
            asset: assetFor(quote.currency, assets),
            platform: mother,
            pay: quote.platformPays,
            sendXlm: quote.sendXlm,
            treasury,
            fee: quote.fee,
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
  if (order.kind !== "RECHARGE" && order.kind !== "TOKEN_TRUST") {
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
  // Subscribing in XLM moves nothing from the platform, so it doesn't sign.
  if (signersNeeded(xdr, chain.config.network.passphrase).has(mother))
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
