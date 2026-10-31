import { Account, type Horizon, type Transaction, TransactionBuilder } from "@stellar/stellar-sdk";

import {
  buildStorageWithdraw,
  networkFeeXlm,
  type RechargeProblem,
  toAmount,
  toDisplay,
  toStroops,
} from "@bandcoin/chain";
import { QUOTE_TTL_SECONDS, TRUSTLINE_RESERVE_XLM } from "@bandcoin/chain/quote";
import { fundsOf, spendableXlm } from "@bandcoin/chain/server";
import { AppError, ErrorCodes, isAppError } from "@bandcoin/errors";

import { type Context, isCustodial, type SessionUser } from "../../context";
import { transitionOrder } from "../order-state";
import { finishPlain } from "../orders/finish";
import { failOrder, ownOrder, userSignature } from "../purchase";

/**
 * What the artist's storage holds, and taking some of it back into their own
 * wallet, like bandfan's "take back from storage". The artist's wallet is the
 * source and pays the network fee; if it doesn't hold that token yet it opens
 * the trustline (0.5 XLM locked in their own wallet). Storage co-signs.
 */
type ServiceCtx = Pick<Context, "db" | "chain" | "activity">;
type ArtistRef = { storageAccountId: string | null };
/** XLM has no issuer */
type WithdrawInput = { code: string; issuer: string | null; amount: string };
export type WithdrawBreakdown = { code: string; issuer: string | null; amount: string };

const unavailable = (message: string): RechargeProblem => ({ code: "UNAVAILABLE", message });
const AMOUNT = /^\d{1,12}(\.\d{1,7})?$/;

type CreditLine = Extract<Horizon.HorizonApi.BalanceLine, { asset_code: string }>;
const creditLines = (account: Horizon.AccountResponse | null) =>
  (account?.balances ?? []).filter((line): line is CreditLine => "asset_code" in line);
/** What can move now: the balance less anything promised to open offers. */
const freeOf = (line: CreditLine) => {
  const free = toStroops(line.balance) - toStroops(line.selling_liabilities ?? "0");
  return free > 0n ? free : 0n;
};

async function openStorage(ctx: ServiceCtx, artist: ArtistRef) {
  const storage = artist.storageAccountId
    ? await ctx.db.chainAccount.findUnique({
        where: { id: artist.storageAccountId },
        select: { publicKey: true, activatedAt: true },
      })
    : null;
  return storage?.activatedAt ? storage : null;
}

/** Everything in storage that can be taken out: spare XLM first, then payment assets, then copies. */
export async function storageContents(ctx: ServiceCtx, artist: ArtistRef) {
  const storage = await openStorage(ctx, artist);
  if (!storage) return null;
  const account = await ctx.chain.loadAccount(storage.publicKey);
  const lines = creditLines(account);
  const tokens = lines.length
    ? await ctx.db.classicToken.findMany({
        where: { OR: lines.map((line) => ({ code: line.asset_code, issuer: line.asset_issuer })) },
        select: { code: true, issuer: true, item: { select: { id: true, title: true } } },
      })
    : [];
  const { bandcoin, usdc } = ctx.chain.config.assets;
  const titleOf = (line: CreditLine) =>
    tokens.find((token) => token.code === line.asset_code && token.issuer === line.asset_issuer)
      ?.item ?? null;
  const isPayment = (line: CreditLine) =>
    [bandcoin, usdc].some(
      (asset) => asset.code === line.asset_code && asset.issuer === line.asset_issuer,
    );

  return {
    publicKey: storage.publicKey,
    holdings: [
      {
        code: "XLM",
        issuer: null,
        amount: account ? spendableXlm(account) : "0",
        title: "XLM you can take out",
        itemId: null,
      },
      ...[...lines]
        .sort((a, b) => Number(isPayment(b)) - Number(isPayment(a)))
        .map((line) => ({
          code: line.asset_code,
          issuer: line.asset_issuer,
          amount: toAmount(freeOf(line)),
          title: titleOf(line)?.title ?? null,
          itemId: titleOf(line)?.id ?? null,
        })),
    ],
  };
}

async function prepare(
  ctx: ServiceCtx,
  user: SessionUser,
  artist: ArtistRef,
  input: WithdrawInput,
) {
  const { chain } = ctx;
  const problems: RechargeProblem[] = [];
  const storage = await openStorage(ctx, artist);
  if (!storage) problems.push(unavailable("Your storage account isn't open."));
  const native = input.issuer === null;
  if (native && input.code !== "XLM")
    throw new AppError(ErrorCodes.VALIDATION_FAILED, { message: "Choose what to take out." });

  const valid = AMOUNT.test(input.amount) && toStroops(input.amount) > 0n;
  if (!valid) problems.push(unavailable("Enter an amount above zero."));

  const [mine, held] = await Promise.all([
    chain.loadAccount(user.walletAddress),
    storage ? chain.loadAccount(storage.publicKey) : null,
  ]);
  if (!mine)
    problems.push(
      unavailable("Your wallet needs its first XLM before it can pay the network fee."),
    );

  const line = native
    ? null
    : creditLines(held).find(
        (entry) => entry.asset_code === input.code && entry.asset_issuer === input.issuer,
      );
  const available = native ? (held ? toStroops(spendableXlm(held)) : 0n) : line ? freeOf(line) : 0n;
  if (storage && valid && toStroops(input.amount) > available)
    problems.push(
      unavailable(
        available > 0n
          ? `Storage has only ${toDisplay(available)} ${input.code} to take out.`
          : `Storage holds no ${input.code} to take out.`,
      ),
    );

  const openTrustline =
    !native &&
    !creditLines(mine).some(
      (entry) => entry.asset_code === input.code && entry.asset_issuer === input.issuer,
    );
  const fee = toStroops(networkFeeXlm(openTrustline ? 2 : 1, chain.config.network.baseFee));
  const reserve = openTrustline ? toStroops(TRUSTLINE_RESERVE_XLM) : 0n;
  const xlm = fundsOf(mine, chain.config.assets).XLM;
  if (problems.length === 0 && toStroops(xlm) < fee + reserve) {
    const have = toStroops(xlm);
    problems.push({
      code: "INSUFFICIENT_FUNDS",
      message: `You need ${toDisplay(fee + reserve - have)} more XLM to take this out.`,
      shortfall: {
        currency: "XLM",
        need: toDisplay(fee + reserve),
        have: toDisplay(have),
        short: toDisplay(fee + reserve - have),
      },
    });
  }
  return { storage, mine, openTrustline, fee, reserve, problems };
}

function priceOf(prepared: Awaited<ReturnType<typeof prepare>>, input: WithdrawInput) {
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
              label: `Let your wallet hold ${input.code}`,
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

export async function quoteWithdraw(
  ctx: ServiceCtx,
  user: SessionUser,
  artist: ArtistRef,
  input: WithdrawInput,
) {
  return priceOf(await prepare(ctx, user, artist, input), input);
}

/** Creates the order and the unsigned transaction. Nothing is signed or sent yet. */
export async function startWithdraw(
  ctx: ServiceCtx,
  user: SessionUser,
  artist: ArtistRef,
  input: WithdrawInput,
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
  const withdraw: WithdrawBreakdown = { code: input.code, issuer: input.issuer, amount };
  const order = await ctx.db.order.create({
    data: {
      kind: "STORAGE_WITHDRAW",
      buyerId: user.id,
      currency: "XLM",
      unitPrice: quote.total,
      platformFee: "0",
      total: quote.total,
      method: "WALLET",
      quoteExpiresAt: new Date(quote.expiresAt),
      breakdown: { ...quote, withdrawDetails: withdraw },
    },
  });
  ctx.activity.set({
    targetType: "Order",
    targetId: order.id,
    amount: quote.total,
    currency: "XLM",
  });

  const built = buildStorageWithdraw({
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

/** Sends it: the artist's signature (wallet, or the server's after the countdown), then storage's. */
export async function submitWithdraw(
  ctx: ServiceCtx,
  user: SessionUser,
  artist: ArtistRef,
  input: { orderId: string; xdr: string },
) {
  const { chain, db } = ctx;
  const order = await ownOrder(ctx, user, input.orderId);
  if (order.kind !== "STORAGE_WITHDRAW")
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

  // Storage's key is looked up here, never taken from the request; the hash pins the payment.
  const storage = await openStorage(ctx, artist);
  if (!storage) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Order not found" });
  let xdr = await userSignature(ctx, user, order.txHash, input.xdr);
  const paysFromStorage = (
    TransactionBuilder.fromXDR(xdr, chain.config.network.passphrase) as Transaction
  ).operations.some((op) => op.type === "payment" && op.source === storage.publicKey);
  if (!paysFromStorage)
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Order not found" });
  xdr = await chain.signWithServerKeys(xdr, [storage.publicKey]);

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
