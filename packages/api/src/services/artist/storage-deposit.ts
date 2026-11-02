import { Account, type Transaction, TransactionBuilder } from "@stellar/stellar-sdk";

import {
  buildStorageDeposit,
  networkFeeXlm,
  type RechargeProblem,
  toAmount,
  toDisplay,
  toStroops,
} from "@bandcoin/chain";
import { QUOTE_TTL_SECONDS, TRUSTLINE_RESERVE_XLM } from "@bandcoin/chain/quote";
import { spendableXlm } from "@bandcoin/chain/server";
import { AppError, ErrorCodes, isAppError } from "@bandcoin/errors";

import { type Context, isCustodial, type SessionUser } from "../../context";
import { transitionOrder } from "../order-state";
import { finishPlain } from "../orders/finish";
import { failOrder, ownOrder, userSignature } from "../purchase";
import { creditLines, freeOf, type HoldingKind, openedStorage } from "./storage-withdraw";

/**
 * The artist's wallet next to their storage (Settings › Balances), and moving
 * XLM or a token from the wallet into storage, the other way to "take out".
 * The wallet is the source and pays the network fee. A token storage doesn't
 * hold yet also needs its trustline: the wallet sends storage the 0.5 XLM it
 * locks, storage opens it and co-signs. Everything is shown first.
 */
type ServiceCtx = Pick<Context, "db" | "chain" | "activity">;
type ArtistRef = { storageAccountId: string | null; fanTokenItemId: string | null };
/** XLM has no issuer */
type DepositInput = { code: string; issuer: string | null; amount: string };

const unavailable = (message: string): RechargeProblem => ({ code: "UNAVAILABLE", message });
const AMOUNT = /^\d{1,12}(\.\d{1,7})?$/;

/** What the wallet can move: spendable XLM first, then each token (fan token on top). */
export async function walletContents(
  ctx: ServiceCtx,
  user: Pick<SessionUser, "walletAddress">,
  artist: ArtistRef,
) {
  if (!user.walletAddress) return null;
  const account = await ctx.chain.loadAccount(user.walletAddress);
  const fanToken = artist.fanTokenItemId
    ? await ctx.db.classicToken.findUnique({
        where: { itemId: artist.fanTokenItemId },
        select: { code: true, issuer: true },
      })
    : null;
  const isFan = (code: string, issuer: string) =>
    fanToken?.code === code && fanToken.issuer === issuer;
  const { bandcoin, usdc } = ctx.chain.config.assets;
  const kindOf = (code: string, issuer: string): HoldingKind =>
    bandcoin.code === code && bandcoin.issuer === issuer
      ? "bandcoin"
      : usdc.code === code && usdc.issuer === issuer
        ? "usdc"
        : isFan(code, issuer)
          ? "fanToken"
          : "other";
  const lines = creditLines(account)
    .map((line) => ({
      code: line.asset_code,
      issuer: line.asset_issuer,
      amount: toAmount(freeOf(line)),
      fanToken: isFan(line.asset_code, line.asset_issuer),
      kind: kindOf(line.asset_code, line.asset_issuer),
    }))
    .sort((a, b) => Number(b.fanToken) - Number(a.fanToken));
  return {
    publicKey: user.walletAddress,
    holdings: [
      {
        code: "XLM",
        issuer: null,
        amount: account ? spendableXlm(account) : "0",
        fanToken: false,
        kind: "xlm" as HoldingKind,
      },
      ...lines,
    ],
  };
}

async function prepare(ctx: ServiceCtx, user: SessionUser, artist: ArtistRef, input: DepositInput) {
  const { chain } = ctx;
  const problems: RechargeProblem[] = [];
  const storage = await openedStorage(ctx, artist);
  if (!storage) problems.push(unavailable("Your storage account isn't open."));
  const native = input.issuer === null;
  if (native && input.code !== "XLM")
    throw new AppError(ErrorCodes.VALIDATION_FAILED, { message: "Choose what to move." });

  const valid = AMOUNT.test(input.amount) && toStroops(input.amount) > 0n;
  if (!valid) problems.push(unavailable("Enter an amount above zero."));

  const [mine, held] = await Promise.all([
    chain.loadAccount(user.walletAddress),
    storage ? chain.loadAccount(storage.publicKey) : null,
  ]);
  if (!mine) problems.push(unavailable("Your wallet needs its first XLM before it can pay."));

  const sameAsset = (code: string, issuer: string) =>
    code === input.code && issuer === input.issuer;
  const openTrustline =
    !native && !creditLines(held).some((line) => sameAsset(line.asset_code, line.asset_issuer));
  const fee = toStroops(networkFeeXlm(openTrustline ? 3 : 1, chain.config.network.baseFee));
  const reserve = openTrustline ? toStroops(TRUSTLINE_RESERVE_XLM) : 0n;
  const amount = valid ? toStroops(input.amount) : 0n;

  // The XLM leaving the wallet: the fee, any reserve, and the amount itself when it's XLM.
  const xlmNeeded = fee + reserve + (native ? amount : 0n);
  const xlmHave = mine ? toStroops(spendableXlm(mine)) : 0n;
  if (!native && mine && valid) {
    const line = creditLines(mine).find((entry) => sameAsset(entry.asset_code, entry.asset_issuer));
    const have = line ? freeOf(line) : 0n;
    if (amount > have)
      problems.push(
        unavailable(
          have > 0n
            ? `Your wallet has only ${toDisplay(have)} ${input.code} to move.`
            : `Your wallet holds no ${input.code}.`,
        ),
      );
  }
  if (problems.length === 0 && xlmHave < xlmNeeded)
    problems.push({
      code: "INSUFFICIENT_FUNDS",
      message: `You need ${toDisplay(xlmNeeded - xlmHave)} more XLM to move this.`,
      shortfall: {
        currency: "XLM",
        need: toDisplay(xlmNeeded),
        have: toDisplay(xlmHave),
        short: toDisplay(xlmNeeded - xlmHave),
      },
    });
  return { storage, mine, openTrustline, fee, reserve, problems };
}

function priceOf(prepared: Awaited<ReturnType<typeof prepare>>, input: DepositInput) {
  const { openTrustline, fee, reserve, problems } = prepared;
  return {
    ok: problems.length === 0,
    problems,
    total: toAmount(fee + reserve),
    lines: [
      ...(openTrustline
        ? [
            {
              key: "reserve",
              label: `Let storage hold ${input.code}`,
              currency: "XLM" as const,
              amount: toDisplay(reserve),
            },
          ]
        : []),
      { key: "networkFee", label: "Network fee", currency: "XLM" as const, amount: toDisplay(fee) },
      {
        key: "total",
        label: "You pay",
        currency: "XLM" as const,
        amount: toDisplay(fee + reserve),
      },
    ],
    expiresAt: new Date(Date.now() + QUOTE_TTL_SECONDS * 1000).toISOString(),
  };
}

export async function quoteDeposit(
  ctx: ServiceCtx,
  user: SessionUser,
  artist: ArtistRef,
  input: DepositInput,
) {
  return priceOf(await prepare(ctx, user, artist, input), input);
}

/** Creates the order and the unsigned transaction. Nothing is signed or sent yet. */
export async function startDeposit(
  ctx: ServiceCtx,
  user: SessionUser,
  artist: ArtistRef,
  input: DepositInput,
) {
  const prepared = await prepare(ctx, user, artist, input);
  const quote = priceOf(prepared, input);
  const { storage, mine, openTrustline } = prepared;
  if (!quote.ok || !storage || !mine) {
    throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, {
      message: quote.problems[0]?.message ?? "This can't go through right now.",
      details: { problems: quote.problems },
    });
  }

  const amount = toAmount(toStroops(input.amount));
  const order = await ctx.db.order.create({
    data: {
      kind: "STORAGE_DEPOSIT",
      buyerId: user.id,
      currency: "XLM",
      unitPrice: quote.total,
      platformFee: "0",
      total: quote.total,
      method: "WALLET",
      quoteExpiresAt: new Date(quote.expiresAt),
      breakdown: { ...quote, depositDetails: { code: input.code, issuer: input.issuer, amount } },
    },
  });
  ctx.activity.set({
    targetType: "Order",
    targetId: order.id,
    amount: quote.total,
    currency: "XLM",
  });

  const built = buildStorageDeposit({
    artist: new Account(mine.accountId(), mine.sequenceNumber()),
    network: ctx.chain.config.network,
    storage: storage.publicKey,
    asset: input.issuer ? { code: input.code, issuer: input.issuer } : null,
    amount,
    openTrustline,
    memo: order.id,
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

/** Sends it: the artist's signature, then storage's when it opens a trustline. */
export async function submitDeposit(
  ctx: ServiceCtx,
  user: SessionUser,
  artist: ArtistRef,
  input: { orderId: string; xdr: string },
) {
  const { chain, db } = ctx;
  const order = await ownOrder(ctx, user, input.orderId);
  if (order.kind !== "STORAGE_DEPOSIT")
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Order not found" });
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

  const storage = await openedStorage(ctx, artist);
  if (!storage) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Order not found" });
  // The hash pins the exact transaction, so storage only ever signs the trustline it opens.
  let xdr = await userSignature(ctx, user, order.txHash, input.xdr);
  const opensTrust = (
    TransactionBuilder.fromXDR(xdr, chain.config.network.passphrase) as Transaction
  ).operations.some((op) => op.type === "changeTrust" && op.source === storage.publicKey);
  if (opensTrust) xdr = await chain.signWithServerKeys(xdr, [storage.publicKey]);

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

  return finishPlain(ctx, order.id);
}
