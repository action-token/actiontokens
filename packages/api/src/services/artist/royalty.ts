import { Account, type Asset } from "@stellar/stellar-sdk";

import {
  assetFor,
  buildRoyaltyPayouts,
  MAX_OPERATIONS_PER_TX,
  networkFeeXlm,
  type OnChainCurrency,
  royaltyPool,
  splitRoyalty,
  toAmount,
  toStroops,
  type RoyaltyShare,
} from "@actiontokens/chain";
import { QUOTE_TTL_SECONDS, type QuoteLine, type QuoteProblem } from "@actiontokens/chain/quote";
import { fundsOf } from "@actiontokens/chain/server";
import { AppError, ErrorCodes, isAppError } from "@actiontokens/errors";

import { type Context, isCustodial, type SessionUser } from "../../context";
import { holdsLine, userSignature } from "../purchase";

import { checkOwnUrls, invalid } from "./items";

/**
 * Royalty payouts. A royalty item gives its holders a share (a percent) of the
 * artist's revenue. When the artist reports revenue, that share is the pool;
 * every token is worth pool ÷ supply to whoever holds it, so the share of
 * tokens nobody bought stays with the artist (see `splitRoyalty`).
 *
 *   quote   who gets what, and the whole price, before anything is signed
 *   start   saves the payout and its lines, builds the batches (≤100 payments
 *           each) the artist signs
 *   submit  one batch at a time, in order, signed by the artist's wallet (or the
 *           server after the custodial countdown); each batch marks its lines
 *   resume  rebuilds what wasn't sent; first checks the network, so a batch
 *           whose answer was lost is never paid twice
 *   cancel  while nothing has been submitted
 *
 * The artist is the source of every transaction, so they pay the network fee;
 * holders are paid straight from the artist's wallet, never through the platform.
 */
type ServiceCtx = Pick<Context, "db" | "chain" | "activity">;
type ArtistRef = { id: string };

export type RoyaltyInput = { itemId: string; revenue: string; currency: OnChainCurrency };
export type ReportFile = { url: string; name: string; size: number; type: string };

/** How many holders the quote lists by name; the payout still pays everyone. */
const PREVIEW = 50;
const CHECK_CONCURRENCY = 10;
const unavailable = (message: string): QuoteProblem => ({ code: "UNAVAILABLE", message });

async function prepare(ctx: ServiceCtx, user: SessionUser, artist: ArtistRef, input: RoyaltyInput) {
  const { chain, db } = ctx;
  const problems: QuoteProblem[] = [];

  const item = await db.item.findFirst({
    where: { id: input.itemId, artistId: artist.id, type: "ROYALTY", deletedAt: null },
    select: {
      id: true,
      title: true,
      supply: true,
      royaltyPercent: true,
      classicToken: { select: { code: true, issuer: true } },
    },
  });
  if (!item?.classicToken)
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Royalty item not found" });

  const revenueOk = /^\d{1,13}(\.\d{1,7})?$/.test(input.revenue) && toStroops(input.revenue) > 0n;
  if (!revenueOk) problems.push(unavailable("Enter the revenue as a number above 0."));
  if (!item.supply)
    problems.push(unavailable("Set how many shares exist on this item before paying out."));
  if (!item.royaltyPercent)
    problems.push(unavailable("This item doesn't say what share of revenue holders get."));

  const pool =
    revenueOk && item.royaltyPercent
      ? royaltyPool(input.revenue, item.royaltyPercent.toString())
      : "0";
  const { code, issuer } = item.classicToken;

  const [held, artistRow, account] = await Promise.all([
    chain.assetHolders(code, issuer),
    db.artist.findUnique({
      where: { id: artist.id },
      select: {
        issuerAccount: { select: { publicKey: true } },
        storageAccount: { select: { publicKey: true } },
      },
    }),
    chain.loadAccount(user.walletAddress),
  ]);
  if (!held.complete)
    problems.push(unavailable("This item has too many holders to pay in one go. Contact support."));
  if (!account) problems.push(unavailable("Your wallet needs its first XLM before it can pay."));

  // Accounts that hold the token for the artist or the platform are never paid.
  const excluded = new Set(
    [
      user.walletAddress,
      issuer,
      artistRow?.issuerAccount?.publicKey,
      artistRow?.storageAccount?.publicKey,
      chain.config.treasury,
      chain.config.mother,
    ].filter((key): key is string => Boolean(key)),
  );
  const holders = held.holders.filter((holder) => !excluded.has(holder.address));

  const split =
    item.supply && revenueOk
      ? splitRoyalty({ pool, supply: item.supply, holders })
      : { shares: [] as RoyaltyShare[], paid: "0.0000000", kept: pool };

  // A holder with no trustline for the payout asset can't be paid; their payment would fail the whole batch.
  const asset = assetFor(input.currency, chain.config.assets);
  const { payable, skipped } = await splitByTrustline(ctx, split.shares, asset);
  const paid = payable.reduce((total, share) => total + toStroops(share.amount), 0n);
  const kept = toStroops(pool) - paid;

  if (revenueOk && item.supply && payable.length === 0)
    problems.push(
      unavailable(
        holders.length === 0
          ? "Nobody holds this item yet, so there is nobody to pay."
          : skipped.length > 0
            ? `None of the holders can receive ${input.currency} yet. Pay in XLM instead.`
            : "That amount is too small to give any holder a share.",
      ),
    );

  const batches = Math.ceil(payable.length / MAX_OPERATIONS_PER_TX);
  const fee = networkFeeXlm(payable.length, chain.config.network.baseFee);
  const lines: QuoteLine[] = [
    {
      key: "price",
      label: "Paid to holders",
      detail: `${payable.length} ${payable.length === 1 ? "holder" : "holders"}${batches > 1 ? `, in ${batches} batches` : ""}`,
      amount: toAmount(paid),
      currency: input.currency,
    },
    {
      key: "networkFee",
      label: "Network fee",
      amount: payable.length > 0 ? fee : "0.0000000",
      currency: "XLM",
    },
  ];
  const totals = new Map<OnChainCurrency, bigint>();
  for (const line of lines) {
    const currency = line.currency as OnChainCurrency;
    totals.set(currency, (totals.get(currency) ?? 0n) + toStroops(line.amount));
  }
  if (account) {
    const funds = fundsOf(account, chain.config.assets);
    for (const [currency, need] of totals) {
      const have = toStroops(funds[currency]);
      if (have >= need) continue;
      problems.push({
        code: "INSUFFICIENT_FUNDS",
        message: `You're ${toAmount(need - have)} ${currency} short.`,
        shortfall: {
          currency,
          need: toAmount(need),
          have: toAmount(have),
          short: toAmount(need - have),
        },
      });
    }
  }

  return {
    item,
    token: { code, issuer },
    account,
    asset,
    payable,
    skipped,
    pool,
    paid: toAmount(paid),
    kept: toAmount(kept),
    quote: {
      currency: input.currency,
      lines,
      totals: [...totals].map(([currency, amount]) => ({ currency, amount: toAmount(amount) })),
      problems,
      ok: problems.length === 0,
      expiresAt: new Date(Date.now() + QUOTE_TTL_SECONDS * 1000).toISOString(),
    },
  };
}

/** Splits shares into those the holder can receive and those whose wallet lacks the asset's trustline. */
async function splitByTrustline(ctx: ServiceCtx, shares: RoyaltyShare[], asset: Asset) {
  if (asset.isNative()) return { payable: shares, skipped: [] as RoyaltyShare[] };
  const payable: RoyaltyShare[] = [];
  const skipped: RoyaltyShare[] = [];
  for (let start = 0; start < shares.length; start += CHECK_CONCURRENCY) {
    const chunk = shares.slice(start, start + CHECK_CONCURRENCY);
    const accounts = await Promise.all(chunk.map((share) => ctx.chain.loadAccount(share.address)));
    chunk.forEach((share, index) => {
      const account = accounts[index];
      (account && holdsLine(account, asset) ? payable : skipped).push(share);
    });
  }
  return { payable, skipped };
}

export async function quoteRoyalty(
  ctx: ServiceCtx,
  user: SessionUser,
  artist: ArtistRef,
  input: RoyaltyInput,
) {
  const prepared = await prepare(ctx, user, artist, input);
  return {
    ...prepared.quote,
    item: { id: prepared.item.id, title: prepared.item.title, code: prepared.token.code },
    percent: prepared.item.royaltyPercent?.toString() ?? null,
    supply: prepared.item.supply,
    pool: prepared.pool,
    paid: prepared.paid,
    kept: prepared.kept,
    holders: {
      count: prepared.payable.length,
      preview: prepared.payable.slice(0, PREVIEW),
      skipped: prepared.skipped.length,
    },
  };
}

/** Saves the payout and builds the batches the artist signs. Nothing is sent yet. */
export async function startRoyalty(
  ctx: ServiceCtx,
  user: SessionUser,
  artist: ArtistRef,
  input: RoyaltyInput & { report: ReportFile },
) {
  const { report } = input;
  if (!Number.isInteger(report.size) || report.size < 1) throw invalid("Add the revenue report.");
  checkOwnUrls({ file: report.url });

  const prepared = await prepare(ctx, user, artist, input);
  const { quote, account, payable } = prepared;
  if (!quote.ok || !account) {
    throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, {
      message: quote.problems[0]?.message ?? "This can't go through right now.",
      details: { problems: quote.problems },
    });
  }

  const { network } = ctx.chain.config;
  const payout = await ctx.db.$transaction(async (tx) => {
    const saved = await tx.royaltyReport.create({
      data: {
        itemId: prepared.item.id,
        fileUrl: report.url,
        fileName: report.name.slice(0, 200),
        fileSize: report.size,
        fileType: report.type.slice(0, 120),
      },
    });
    const row = await tx.royaltyPayout.create({
      data: {
        itemId: prepared.item.id,
        artistId: artist.id,
        reportId: saved.id,
        currency: input.currency,
        totalAmount: prepared.paid,
        status: "DRAFT",
      },
    });
    const batches = buildRoyaltyPayouts({
      payer: new Account(account.accountId(), account.sequenceNumber()),
      network,
      asset: prepared.asset,
      lines: payable.map((share) => ({ to: share.address, amount: share.amount })),
      payoutId: row.id,
    });
    await tx.royaltyPayoutLine.createMany({
      data: payable.map((share, index) => ({
        payoutId: row.id,
        holderAddress: share.address,
        balance: share.balance,
        amount: share.amount,
        batchNo: Math.floor(index / MAX_OPERATIONS_PER_TX) + 1,
        txHash: batches[Math.floor(index / MAX_OPERATIONS_PER_TX)]!.hash,
      })),
    });
    return { id: row.id, batches };
  });
  ctx.activity.set({
    targetType: "RoyaltyPayout",
    targetId: payout.id,
    amount: prepared.paid,
    currency: input.currency,
  });
  return {
    payoutId: payout.id,
    quote,
    batches: payout.batches.map((batch, index) => ({ batchNo: index + 1, xdr: batch.xdr })),
    signer: isCustodial(user) ? ("custodial" as const) : ("wallet" as const),
  };
}

/** Sends one batch. Batches go in order: each follows the last one's sequence number. */
export async function submitRoyaltyBatch(
  ctx: ServiceCtx,
  user: SessionUser,
  artist: ArtistRef,
  input: { payoutId: string; batchNo: number; xdr: string },
) {
  const { chain, db } = ctx;
  const payout = await ownPayout(ctx, artist, input.payoutId);
  ctx.activity.set({
    targetType: "RoyaltyPayout",
    targetId: payout.id,
    amount: payout.totalAmount.toString(),
    currency: payout.currency,
  });
  if (payout.status === "COMPLETE" || payout.status === "FAILED")
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, {
      message: `This payout is already ${payout.status.toLowerCase()}.`,
    });

  const lines = await db.royaltyPayoutLine.findMany({
    where: { payoutId: payout.id },
    select: { batchNo: true, status: true, txHash: true },
  });
  const batch = lines.filter((line) => line.batchNo === input.batchNo);
  const txHash = batch[0]?.txHash;
  if (!txHash) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Batch not found" });
  if (batch.some((line) => line.status !== "PENDING"))
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, { message: "This batch was already sent." });
  if (lines.some((line) => line.batchNo < input.batchNo && line.status !== "SENT"))
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, {
      message: "Send the earlier batches first.",
    });

  const xdr = await userSignature(ctx, user, txHash, input.xdr);
  await db.royaltyPayout.update({ where: { id: payout.id }, data: { status: "SUBMITTING" } });
  try {
    const { hash } = await chain.submit(xdr);
    ctx.activity.set({ txHash: hash });
  } catch (error) {
    // A lost response may still have landed: leave it for `resume`, which asks the network.
    if (isAppError(error) && error.code === ErrorCodes.STELLAR_TX_SUBMIT_FAILED) throw error;
    await db.royaltyPayoutLine.updateMany({
      where: { payoutId: payout.id, batchNo: input.batchNo },
      data: { status: "FAILED" },
    });
    await settle(ctx, payout.id);
    throw error;
  }
  await db.royaltyPayoutLine.updateMany({
    where: { payoutId: payout.id, batchNo: input.batchNo },
    data: { status: "SENT" },
  });
  const status = await settle(ctx, payout.id);
  return { payoutId: payout.id, batchNo: input.batchNo, status };
}

/**
 * Brings the payout's status in line with its lines: complete once everything
 * is sent, partial if some were sent and some weren't, failed if nothing went.
 */
async function settle(ctx: Pick<ServiceCtx, "db">, payoutId: string) {
  const counts = await ctx.db.royaltyPayoutLine.groupBy({
    by: ["status"],
    where: { payoutId },
    _count: true,
  });
  const n = (status: string) => counts.find((row) => row.status === status)?._count ?? 0;
  const status =
    n("PENDING") > 0
      ? "SUBMITTING"
      : n("FAILED") === 0
        ? "COMPLETE"
        : n("SENT") > 0
          ? "PARTIAL"
          : "FAILED";
  await ctx.db.royaltyPayout.update({ where: { id: payoutId }, data: { status } });
  return status;
}

/**
 * Prepares what is left of a payout: asks the network about every unsent batch
 * first (one that landed but whose answer was lost is marked sent, never paid
 * twice), then rebuilds the rest with fresh sequence numbers.
 */
export async function resumeRoyalty(
  ctx: ServiceCtx,
  user: SessionUser,
  artist: ArtistRef,
  input: { payoutId: string },
) {
  const { chain, db } = ctx;
  const payout = await ownPayout(ctx, artist, input.payoutId);
  if (payout.status === "COMPLETE" || payout.status === "DRAFT")
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, {
      message: payout.status === "COMPLETE" ? "Everyone was paid." : "Nothing was sent yet.",
    });

  if (
    payout.status === "FAILED" &&
    !(await db.royaltyPayoutLine.count({ where: { payoutId: payout.id, status: "SENT" } }))
  )
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, { message: "This payout was canceled." });

  const unsent = await db.royaltyPayoutLine.findMany({
    where: { payoutId: payout.id, status: { not: "SENT" } },
    orderBy: { id: "asc" },
  });
  for (const txHash of new Set(unsent.map((line) => line.txHash))) {
    if (!txHash) continue;
    const found = await chain.findTransaction(txHash);
    if (found?.successful)
      await db.royaltyPayoutLine.updateMany({
        where: { payoutId: payout.id, txHash },
        data: { status: "SENT" },
      });
  }
  const stillUnsent = await db.royaltyPayoutLine.findMany({
    where: { payoutId: payout.id, status: { not: "SENT" } },
    orderBy: { id: "asc" },
  });
  const signer = isCustodial(user) ? ("custodial" as const) : ("wallet" as const);
  if (stillUnsent.length === 0) {
    // Every batch had landed after all: nothing to sign.
    const status = await settle(ctx, payout.id);
    return { payoutId: payout.id, batches: [], signer, status };
  }

  const account = await chain.loadAccount(user.walletAddress);
  if (!account) throw new AppError(ErrorCodes.WALLET_NOT_CONNECTED);
  const lastSent = await db.royaltyPayoutLine.aggregate({
    where: { payoutId: payout.id, status: "SENT" },
    _max: { batchNo: true },
  });
  const firstBatch = (lastSent._max.batchNo ?? 0) + 1;

  const batches = buildRoyaltyPayouts({
    payer: new Account(account.accountId(), account.sequenceNumber()),
    network: chain.config.network,
    asset: assetFor(payout.currency as OnChainCurrency, chain.config.assets),
    lines: stillUnsent.map((line) => ({ to: line.holderAddress, amount: line.amount.toString() })),
    payoutId: payout.id,
  });
  await db.$transaction(
    stillUnsent.map((line, index) =>
      db.royaltyPayoutLine.update({
        where: { id: line.id },
        data: {
          status: "PENDING",
          batchNo: firstBatch + Math.floor(index / MAX_OPERATIONS_PER_TX),
          txHash: batches[Math.floor(index / MAX_OPERATIONS_PER_TX)]!.hash,
        },
      }),
    ),
  );
  await db.royaltyPayout.update({ where: { id: payout.id }, data: { status: "SUBMITTING" } });
  ctx.activity.set({ targetType: "RoyaltyPayout", targetId: payout.id });
  return {
    payoutId: payout.id,
    batches: batches.map((batch, index) => ({ batchNo: firstBatch + index, xdr: batch.xdr })),
    signer,
    status: "SUBMITTING" as const,
  };
}

/** Drops a payout that was saved but never submitted (the countdown's Cancel, or a declined wallet popup). Once a batch went out, `resume` is the way on. */
export async function cancelRoyalty(
  ctx: ServiceCtx,
  artist: ArtistRef,
  input: { payoutId: string },
) {
  const payout = await ownPayout(ctx, artist, input.payoutId);
  ctx.activity.set({ targetType: "RoyaltyPayout", targetId: payout.id });
  const touched = await ctx.db.royaltyPayoutLine.count({
    where: { payoutId: payout.id, status: { not: "PENDING" } },
  });
  if (payout.status !== "DRAFT" || touched > 0)
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, {
      message: "Some holders may already be paid. Resume the payout instead.",
    });
  await ctx.db.royaltyPayoutLine.updateMany({
    where: { payoutId: payout.id },
    data: { status: "FAILED" },
  });
  await ctx.db.royaltyPayout.update({ where: { id: payout.id }, data: { status: "FAILED" } });
  return { payoutId: payout.id, status: "FAILED" as const };
}

async function ownPayout(ctx: Pick<ServiceCtx, "db">, artist: ArtistRef, payoutId: string) {
  const payout = await ctx.db.royaltyPayout.findFirst({
    where: { id: payoutId, artistId: artist.id },
  });
  if (!payout) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Payout not found" });
  return payout;
}

/** The artist's royalty items, what each shares, and when it last paid out. */
export async function listRoyaltyItems(ctx: Pick<ServiceCtx, "db">, artist: ArtistRef) {
  const items = await ctx.db.item.findMany({
    where: { artistId: artist.id, type: "ROYALTY", deletedAt: null, classicToken: { isNot: null } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      coverUrl: true,
      supply: true,
      royaltyPercent: true,
      classicToken: { select: { code: true } },
      royaltyPayouts: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
    },
  });
  return items.map((item) => ({
    id: item.id,
    title: item.title,
    coverUrl: item.coverUrl,
    supply: item.supply,
    percent: item.royaltyPercent?.toString() ?? null,
    code: item.classicToken?.code ?? "",
    lastPayoutAt: item.royaltyPayouts[0]?.createdAt ?? null,
  }));
}

/** Every payout the artist started, newest first, with how many holders were paid. */
export async function listPayouts(ctx: Pick<ServiceCtx, "db">, artist: ArtistRef) {
  const payouts = await ctx.db.royaltyPayout.findMany({
    where: { artistId: artist.id },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true,
      currency: true,
      totalAmount: true,
      status: true,
      createdAt: true,
      item: { select: { title: true } },
      report: { select: { fileUrl: true, fileName: true } },
      _count: { select: { lines: true } },
    },
  });
  const sent = await ctx.db.royaltyPayoutLine.groupBy({
    by: ["payoutId"],
    where: { payout: { artistId: artist.id }, status: "SENT" },
    _count: true,
  });
  return payouts.map((payout) => ({
    id: payout.id,
    item: payout.item.title,
    currency: payout.currency,
    total: payout.totalAmount.toString(),
    status: payout.status,
    createdAt: payout.createdAt,
    report: payout.report,
    holders: payout._count.lines,
    paid: sent.find((row) => row.payoutId === payout.id)?._count ?? 0,
  }));
}

/** Who was paid what in one payout. */
export async function payoutLines(
  ctx: Pick<ServiceCtx, "db">,
  artist: ArtistRef,
  payoutId: string,
) {
  await ownPayout(ctx, artist, payoutId);
  const lines = await ctx.db.royaltyPayoutLine.findMany({
    where: { payoutId },
    orderBy: [{ amount: "desc" }, { id: "asc" }],
    take: 500,
    select: {
      id: true,
      holderAddress: true,
      balance: true,
      amount: true,
      status: true,
      txHash: true,
    },
  });
  return lines.map((line) => ({
    ...line,
    balance: line.balance.toString(),
    amount: line.amount.toString(),
  }));
}
