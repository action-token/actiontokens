import {
  Account,
  Asset,
  Keypair,
  type Transaction,
  TransactionBuilder,
} from "@stellar/stellar-sdk";

import {
  applyBps,
  assetFor,
  buildResaleList,
  buildStorageWithdraw,
  networkFeeXlm,
  type RechargeProblem,
  RESALE_STORAGE_BASE_XLM,
  toAmount,
  toDisplay,
  toStroops,
} from "@bandcoin/chain";
import { QUOTE_TTL_SECONDS, TRUSTLINE_RESERVE_XLM } from "@bandcoin/chain/quote";
import { encryptSecret, spendableXlm } from "@bandcoin/chain/server";
import { AppError, ErrorCodes, isAppError } from "@bandcoin/errors";

import { type Context, isCustodial, type SessionUser } from "../../context";
import { transitionOrder } from "../order-state";
import { balanceOf, failOrder, holdsLine, ownOrder, userSignature } from "../purchase";

/**
 * Resale of classic copies, from the holder's side. Listing moves the copies
 * into the holder's own resale storage (an account Bandcoin keeps the key
 * for, opened by the holder the first time) and creates the listing in the
 * same transaction's order. Buyers are then served from that storage, so a
 * sale needs nobody to sign. Cancelling moves the unsold copies back.
 *
 *   quote  → what it costs the holder in XLM, and what they'd receive per sale
 *   start  → the order and the transaction the holder signs
 *   submit → storage co-signs its one trustline; the listing appears once the network accepts it
 *
 * A holder can run several listings of the same item at different prices:
 * each one is capped by its own copies, so they never sell each other's.
 */
type ServiceCtx = Pick<Context, "db" | "chain" | "activity">;

export const MAX_LISTED = 10_000;
const PRICE = /^\d{1,12}(\.\d{1,7})?$/;

export type ListInput = {
  itemId: string;
  /** Whole copies */
  amount: number;
  priceBandcoin: string;
  priceUsd: string;
};
type Details = {
  itemId: string;
  code: string;
  issuer: string;
  amount: string;
  priceBandcoin: string;
  priceUsd: string;
  storage: string;
  openStorage: boolean;
};

const unavailable = (message: string): RechargeProblem => ({ code: "UNAVAILABLE", message });

/** The classic item a holder may resell: not a fan token, not hidden or deleted. */
async function resalableItem(ctx: Pick<ServiceCtx, "db">, itemId: string) {
  const item = await ctx.db.item.findFirst({
    where: { id: itemId, deletedAt: null, hiddenAt: null },
    select: {
      id: true,
      title: true,
      type: true,
      chainType: true,
      royaltyPercent: true,
      classicToken: { select: { code: true, issuer: true } },
    },
  });
  if (
    !item ||
    item.chainType !== "CLASSIC_TOKEN" ||
    !item.classicToken ||
    item.type === "FAN_TOKEN"
  )
    throw new AppError(ErrorCodes.ITEM_NOT_AVAILABLE, { message: "This item can't be resold." });
  return { ...item, token: item.classicToken };
}

const storageOf = (ctx: Pick<ServiceCtx, "db">, userId: string) =>
  ctx.db.chainAccount.findFirst({
    where: { ownerId: userId, kind: "RESALE_STORAGE" },
    orderBy: { createdAt: "asc" },
    select: { id: true, publicKey: true, activatedAt: true },
  });

async function prepareList(ctx: ServiceCtx, user: SessionUser, input: ListInput) {
  const { chain } = ctx;
  const item = await resalableItem(ctx, input.itemId);
  const problems: RechargeProblem[] = [];
  const token = new Asset(item.token.code, item.token.issuer);
  const bandcoin = assetFor("BANDCOIN", chain.config.assets);

  if (!Number.isInteger(input.amount) || input.amount < 1 || input.amount > MAX_LISTED)
    problems.push(unavailable(`List between 1 and ${MAX_LISTED.toLocaleString("en-US")} copies.`));
  for (const [label, value] of [
    ["BANDCOIN", input.priceBandcoin],
    ["USD", input.priceUsd],
  ] as const)
    if (!PRICE.test(value) || toStroops(value) <= 0n)
      problems.push(unavailable(`Set a ${label} price above zero.`));

  const storage = await storageOf(ctx, user.id);
  const [mine, held] = await Promise.all([
    chain.loadAccount(user.walletAddress),
    storage?.activatedAt ? chain.loadAccount(storage.publicKey) : null,
  ]);
  if (!mine) problems.push(unavailable("Your wallet needs its first XLM before it can list."));

  const openStorage = !(storage?.activatedAt || held);
  const openTrustline = openStorage || !(held && holdsLine(held, token));
  const openPayoutLine = !(mine && holdsLine(mine, bandcoin));

  // Copies already listed (and unsold) stay in storage, so only what the wallet holds is free to list.
  const free = mine ? toStroops(balanceOf(mine, token)) : 0n;
  if (mine && !problems.length && toStroops(input.amount) > free)
    problems.push(
      unavailable(
        free > 0n
          ? `Your wallet holds only ${toDisplay(free)} of these.`
          : "Your wallet doesn't hold any of these.",
      ),
    );

  const operations =
    1 + // the copies
    Number(openPayoutLine) +
    (openStorage ? 2 : openTrustline ? 2 : 0); // createAccount or reserve payment, then the trustline
  const fee = toStroops(networkFeeXlm(operations, chain.config.network.baseFee));
  const reserve = openTrustline && !openStorage ? toStroops(TRUSTLINE_RESERVE_XLM) : 0n;
  const storageXlm = openStorage
    ? toStroops(RESALE_STORAGE_BASE_XLM) + toStroops(TRUSTLINE_RESERVE_XLM)
    : 0n;
  const payoutReserve = openPayoutLine ? toStroops(TRUSTLINE_RESERVE_XLM) : 0n;
  const xlmNeeded = fee + reserve + storageXlm + payoutReserve;
  const xlmHave = mine ? toStroops(spendableXlm(mine)) : 0n;
  if (mine && problems.length === 0 && xlmHave < xlmNeeded)
    problems.push({
      code: "INSUFFICIENT_FUNDS",
      message: `You need ${toDisplay(xlmNeeded - xlmHave)} more XLM to list this.`,
      shortfall: {
        currency: "XLM",
        need: toDisplay(xlmNeeded),
        have: toDisplay(xlmHave),
        short: toDisplay(xlmNeeded - xlmHave),
      },
    });

  return {
    item,
    token,
    bandcoin,
    storage,
    mine,
    openStorage,
    openTrustline,
    openPayoutLine,
    fee,
    reserve,
    storageXlm,
    payoutReserve,
    xlmNeeded,
    problems,
  };
}

/** What the holder gets per copy: the price less the artist's royalty (the buyer's 2.5% is on top). */
function netOf(item: { royaltyPercent: { toString(): string } | null }, input: ListInput) {
  const bps = Math.round(Number(item.royaltyPercent?.toString() ?? 0) * 100);
  const take = (price: string) => {
    const cents = PRICE.test(price) ? toStroops(price) : 0n;
    const royalty = applyBps(cents, bps);
    return { royalty: toDisplay(royalty), net: toDisplay(cents - royalty) };
  };
  return {
    royaltyPercent: String(item.royaltyPercent?.toString() ?? "0"),
    bandcoin: take(input.priceBandcoin),
    usd: take(input.priceUsd),
  };
}

function priceOf(prepared: Awaited<ReturnType<typeof prepareList>>, input: ListInput) {
  const { problems, fee, reserve, storageXlm, payoutReserve, xlmNeeded } = prepared;
  const line = (key: string, label: string, amount: bigint) => ({
    key,
    label,
    currency: "XLM" as const,
    amount: toDisplay(amount),
  });
  return {
    ok: problems.length === 0,
    problems,
    total: toAmount(xlmNeeded),
    lines: [
      ...(prepared.openStorage
        ? [line("storage", "Open your resale storage (once)", storageXlm)]
        : []),
      ...(reserve > 0n
        ? [line("reserve", `Let storage hold ${prepared.item.token.code}`, reserve)]
        : []),
      ...(prepared.openPayoutLine
        ? [line("payout", "Let your wallet receive BANDCOIN", payoutReserve)]
        : []),
      line("networkFee", "Network fee", fee),
      line("total", "You pay", xlmNeeded),
    ],
    /** XLM that comes back as you remove the lines; it's locked, not spent, except the fee */
    note: "Reserves stay yours: they're locked while the account or line exists.",
    willOpenStorage: prepared.openStorage,
    net: netOf(prepared.item, input),
    expiresAt: new Date(Date.now() + QUOTE_TTL_SECONDS * 1000).toISOString(),
  };
}

export async function quoteList(ctx: ServiceCtx, user: SessionUser, input: ListInput) {
  return priceOf(await prepareList(ctx, user, input), input);
}

/** Creates the order and the unsigned transaction. Nothing is signed or sent yet. */
export async function startList(ctx: ServiceCtx, user: SessionUser, input: ListInput) {
  const prepared = await prepareList(ctx, user, input);
  const quote = priceOf(prepared, input);
  if (!quote.ok || !prepared.mine)
    throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, {
      message: quote.problems[0]?.message ?? "This can't be listed right now.",
      details: { problems: quote.problems },
    });

  // The storage key is made here and kept encrypted; the account exists once the order is delivered.
  const storage =
    prepared.storage ??
    (await ctx.db.chainAccount.create({
      data: (() => {
        const keys = Keypair.random();
        return {
          kind: "RESALE_STORAGE" as const,
          publicKey: keys.publicKey(),
          secretEncrypted: encryptSecret(keys.secret()),
          ownerId: user.id,
        };
      })(),
      select: { id: true, publicKey: true, activatedAt: true },
    }));

  const amount = String(input.amount);
  const details: Details = {
    itemId: prepared.item.id,
    code: prepared.item.token.code,
    issuer: prepared.item.token.issuer,
    amount,
    priceBandcoin: toDisplay(toStroops(input.priceBandcoin)),
    priceUsd: toDisplay(toStroops(input.priceUsd)),
    storage: storage.publicKey,
    openStorage: prepared.openStorage,
  };
  const order = await ctx.db.order.create({
    data: {
      kind: "RESALE_LIST",
      buyerId: user.id,
      itemId: prepared.item.id,
      quantity: input.amount,
      currency: "XLM",
      unitPrice: quote.total,
      platformFee: "0",
      total: quote.total,
      method: "WALLET",
      quoteExpiresAt: new Date(quote.expiresAt),
      breakdown: { ...quote, resale: details },
    },
  });
  ctx.activity.set({
    targetType: "Order",
    targetId: order.id,
    amount: quote.total,
    currency: "XLM",
  });

  const built = buildResaleList({
    seller: new Account(prepared.mine.accountId(), prepared.mine.sequenceNumber()),
    network: ctx.chain.config.network,
    orderId: order.id,
    storage: storage.publicKey,
    asset: prepared.item.token,
    amount,
    openStorage: prepared.openStorage,
    openTrustline: prepared.openTrustline,
    openPayoutLine: prepared.openPayoutLine ? ctx.chain.config.assets.bandcoin : undefined,
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

/** Storage only ever signs the one trustline it opens; the hash pins the rest. */
async function signedForStorage(
  ctx: ServiceCtx,
  user: SessionUser,
  order: { txHash: string },
  xdr: string,
  storage: string,
) {
  let signed = await userSignature(ctx, user, order.txHash, xdr);
  const opensTrust = (
    TransactionBuilder.fromXDR(signed, ctx.chain.config.network.passphrase) as Transaction
  ).operations.some((op) => op.type === "changeTrust" && op.source === storage);
  if (opensTrust) signed = await ctx.chain.signWithServerKeys(signed, [storage]);
  return signed;
}

async function checkOrder(
  ctx: ServiceCtx,
  user: SessionUser,
  orderId: string,
  kind: "RESALE_LIST" | "RESALE_CANCEL",
) {
  const order = await ownOrder(ctx, user, orderId);
  if (order.kind !== kind)
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
    await transitionOrder(ctx.db, order.id, "FAILED", {
      failureCode: ErrorCodes.STELLAR_QUOTE_EXPIRED,
    });
    throw new AppError(ErrorCodes.STELLAR_QUOTE_EXPIRED);
  }
  return { ...order, txHash: order.txHash };
}

async function send(ctx: ServiceCtx, orderId: string, xdr: string) {
  await transitionOrder(ctx.db, orderId, "SUBMITTED");
  try {
    const { hash } = await ctx.chain.submit(xdr);
    ctx.activity.set({ txHash: hash });
  } catch (error) {
    // A lost response may still have landed: leave it SUBMITTED for the worker to re-check.
    if (isAppError(error) && error.code === ErrorCodes.STELLAR_TX_SUBMIT_FAILED) throw error;
    await failOrder(ctx, orderId, error, null);
    throw error;
  }
}

export async function submitList(
  ctx: ServiceCtx,
  user: SessionUser,
  input: { orderId: string; xdr: string },
) {
  const order = await checkOrder(ctx, user, input.orderId, "RESALE_LIST");
  const details = (order.breakdown as { resale?: Details } | null)?.resale;
  const storage = details
    ? await ctx.db.chainAccount.findFirst({
        where: { publicKey: details.storage, ownerId: user.id, kind: "RESALE_STORAGE" },
        select: { publicKey: true },
      })
    : null;
  if (!details || !storage)
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Order not found" });
  await send(ctx, order.id, await signedForStorage(ctx, user, order, input.xdr, storage.publicKey));
  return finishList(ctx, order.id);
}

/** Records the listing once the network has accepted the transaction. Safe to run twice: only the first counts. */
export async function finishList(ctx: Pick<ServiceCtx, "db">, orderId: string) {
  return ctx.db.$transaction(async (tx) => {
    await transitionOrder(tx, orderId, "CONFIRMED");
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    const details = (order.breakdown as { resale?: Details } | null)?.resale;
    if (!details || !order.buyerId)
      throw new AppError(ErrorCodes.INTERNAL, { message: "Order has no listing details" });
    if (details.openStorage)
      await tx.chainAccount.updateMany({
        where: { publicKey: details.storage, activatedAt: null },
        data: { activatedAt: new Date() },
      });
    const listing = await tx.listing.create({
      data: {
        itemId: details.itemId,
        sellerId: order.buyerId,
        kind: "RESALE",
        status: "ACTIVE",
        priceBandcoin: details.priceBandcoin,
        priceUsd: details.priceUsd,
        quantity: Number(details.amount),
      },
      select: { id: true },
    });
    await tx.order.update({ where: { id: orderId }, data: { listingId: listing.id } });
    await transitionOrder(tx, orderId, "DELIVERED");
    return { orderId, status: "DELIVERED" as const, listingId: listing.id };
  });
}

// ─── Change the price, cancel ───────────────────────────────────────────────

async function ownListing(ctx: Pick<ServiceCtx, "db">, user: SessionUser, listingId: string) {
  const listing = await ctx.db.listing.findFirst({
    where: { id: listingId, sellerId: user.id, kind: "RESALE" },
    select: {
      id: true,
      status: true,
      quantity: true,
      quantitySold: true,
      itemId: true,
      item: { select: { classicToken: { select: { code: true, issuer: true } } } },
    },
  });
  if (!listing) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Listing not found" });
  return listing;
}

/** A new price for what's left. Nothing moves on Stellar, so it's instant. */
export async function setListingPrice(
  ctx: Pick<ServiceCtx, "db" | "activity">,
  user: SessionUser,
  input: { listingId: string; priceBandcoin: string; priceUsd: string },
) {
  for (const [label, value] of [
    ["BANDCOIN", input.priceBandcoin],
    ["USD", input.priceUsd],
  ] as const)
    if (!PRICE.test(value) || toStroops(value) <= 0n)
      throw new AppError(ErrorCodes.VALIDATION_FAILED, {
        message: `Set a ${label} price above zero.`,
      });
  const listing = await ownListing(ctx, user, input.listingId);
  if (listing.status !== "ACTIVE" && listing.status !== "PAUSED")
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, { message: "This listing has ended." });
  await ctx.db.listing.update({
    where: { id: listing.id },
    data: {
      priceBandcoin: toDisplay(toStroops(input.priceBandcoin)),
      priceUsd: toDisplay(toStroops(input.priceUsd)),
      status: "ACTIVE",
    },
  });
  ctx.activity.set({ targetType: "Listing", targetId: listing.id });
  return { listingId: listing.id };
}

async function prepareCancel(ctx: ServiceCtx, user: SessionUser, listingId: string) {
  const listing = await ownListing(ctx, user, listingId);
  if (listing.status === "CLOSED" || listing.status === "SOLD_OUT")
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, {
      message: "This listing has already ended.",
    });
  const token = listing.item.classicToken;
  const storage = await storageOf(ctx, user.id);
  if (!token || !storage?.activatedAt)
    return {
      listing,
      token,
      storage,
      amount: 0n,
      openTrustline: false,
      mine: null,
      fee: 0n,
      problems: [] as RechargeProblem[],
    };
  const asset = new Asset(token.code, token.issuer);
  const [mine, held] = await Promise.all([
    ctx.chain.loadAccount(user.walletAddress),
    ctx.chain.loadAccount(storage.publicKey),
  ]);
  const remaining = toStroops(Math.max(0, (listing.quantity ?? 0) - listing.quantitySold));
  const inStorage = held ? toStroops(balanceOf(held, asset)) : 0n;
  const amount = remaining < inStorage ? remaining : inStorage;
  const openTrustline = !(mine && holdsLine(mine, asset));
  const fee = toStroops(networkFeeXlm(openTrustline ? 2 : 1, ctx.chain.config.network.baseFee));
  const need = fee + (openTrustline ? toStroops(TRUSTLINE_RESERVE_XLM) : 0n);
  const problems: RechargeProblem[] = [];
  if (amount > 0n && !mine)
    problems.push(unavailable("Your wallet needs XLM before it can take copies back."));
  if (amount > 0n && mine && toStroops(spendableXlm(mine)) < need)
    problems.push({
      code: "INSUFFICIENT_FUNDS",
      message: `You need ${toDisplay(need - toStroops(spendableXlm(mine)))} more XLM to take them back.`,
      shortfall: {
        currency: "XLM",
        need: toDisplay(need),
        have: spendableXlm(mine),
        short: toDisplay(need - toStroops(spendableXlm(mine))),
      },
    });
  return { listing, token, storage, amount, openTrustline, mine, fee: need, problems };
}

export async function quoteCancel(
  ctx: ServiceCtx,
  user: SessionUser,
  input: { listingId: string },
) {
  const prepared = await prepareCancel(ctx, user, input.listingId);
  return {
    ok: prepared.problems.length === 0,
    problems: prepared.problems,
    /** Copies that go back to the wallet; none means the listing just ends */
    copies: toDisplay(prepared.amount),
    total: toAmount(prepared.fee),
    lines:
      prepared.amount > 0n
        ? [
            {
              key: "networkFee",
              label: "Network fee",
              currency: "XLM" as const,
              amount: toDisplay(prepared.fee),
            },
          ]
        : [],
    expiresAt: new Date(Date.now() + QUOTE_TTL_SECONDS * 1000).toISOString(),
  };
}

/**
 * Ends a listing. With copies left in storage they go back to the holder's
 * wallet in a transaction they sign; with none left (all sold) it just closes.
 */
export async function startCancel(
  ctx: ServiceCtx,
  user: SessionUser,
  input: { listingId: string },
) {
  const prepared = await prepareCancel(ctx, user, input.listingId);
  if (prepared.problems.length > 0)
    throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, {
      message: prepared.problems[0]!.message,
      details: { problems: prepared.problems },
    });
  const { listing, token, storage, mine } = prepared;
  if (prepared.amount === 0n || !token || !storage || !mine) {
    await ctx.db.listing.update({ where: { id: listing.id }, data: { status: "CLOSED" } });
    ctx.activity.set({ targetType: "Listing", targetId: listing.id });
    return { closed: true as const, listingId: listing.id };
  }

  const amount = toAmount(prepared.amount);
  const total = toAmount(prepared.fee);
  const order = await ctx.db.order.create({
    data: {
      kind: "RESALE_CANCEL",
      buyerId: user.id,
      itemId: listing.itemId,
      listingId: listing.id,
      currency: "XLM",
      unitPrice: total,
      platformFee: "0",
      total,
      method: "WALLET",
      quoteExpiresAt: new Date(Date.now() + QUOTE_TTL_SECONDS * 1000),
      breakdown: { resale: { listingId: listing.id, amount, storage: storage.publicKey } },
    },
  });
  ctx.activity.set({ targetType: "Order", targetId: order.id, amount: total, currency: "XLM" });
  const built = buildStorageWithdraw({
    artist: new Account(mine.accountId(), mine.sequenceNumber()),
    network: ctx.chain.config.network,
    storage: storage.publicKey,
    asset: token,
    amount,
    openTrustline: prepared.openTrustline,
    memo: order.id,
  });
  await transitionOrder(ctx.db, order.id, "AWAITING_SIGNATURE", { txHash: built.hash });
  return {
    closed: false as const,
    orderId: order.id,
    copies: amount,
    total,
    xdr: built.xdr,
    signer: isCustodial(user) ? ("custodial" as const) : ("wallet" as const),
  };
}

export async function submitCancel(
  ctx: ServiceCtx,
  user: SessionUser,
  input: { orderId: string; xdr: string },
) {
  const order = await checkOrder(ctx, user, input.orderId, "RESALE_CANCEL");
  const details = (order.breakdown as { resale?: { storage: string } } | null)?.resale;
  const storage = details
    ? await ctx.db.chainAccount.findFirst({
        where: { publicKey: details.storage, ownerId: user.id, kind: "RESALE_STORAGE" },
        select: { publicKey: true },
      })
    : null;
  if (!storage) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Order not found" });
  // Storage co-signs the payment it makes back to the holder.
  let xdr = await userSignature(ctx, user, order.txHash, input.xdr);
  xdr = await ctx.chain.signWithServerKeys(xdr, [storage.publicKey]);
  await send(ctx, order.id, xdr);
  return finishCancel(ctx, order.id);
}

/** The copies are back with the holder: the listing ends. Safe to run twice. */
export async function finishCancel(ctx: Pick<ServiceCtx, "db">, orderId: string) {
  return ctx.db.$transaction(async (tx) => {
    await transitionOrder(tx, orderId, "CONFIRMED");
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    if (order.listingId)
      await tx.listing.updateMany({
        where: { id: order.listingId, status: { in: ["ACTIVE", "PAUSED"] } },
        data: { status: "CLOSED" },
      });
    await transitionOrder(tx, orderId, "DELIVERED");
    return { orderId, status: "DELIVERED" as const };
  });
}

// ─── What the holder sees ───────────────────────────────────────────────────

export async function myListings(ctx: Pick<ServiceCtx, "db">, user: SessionUser) {
  const rows = await ctx.db.listing.findMany({
    where: { sellerId: user.id, kind: "RESALE" },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      status: true,
      priceBandcoin: true,
      priceUsd: true,
      quantity: true,
      quantitySold: true,
      createdAt: true,
      edition: { select: { tokenId: true } },
      item: { select: { slug: true, title: true, coverUrl: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    /** A smart-contract NFT: one numbered copy, listed on the contract */
    tokenId: row.edition?.tokenId ?? null,
    status: row.status,
    priceBandcoin: row.priceBandcoin.toString(),
    priceUsd: row.priceUsd.toString(),
    listed: row.quantity ?? 0,
    sold: row.quantitySold,
    // A listing that ended has nothing on offer: its copies sold or went back to the holder.
    left: row.status === "ACTIVE" ? Math.max(0, (row.quantity ?? 0) - row.quantitySold) : 0,
    createdAt: row.createdAt,
    item: row.item,
  }));
}

/** What sold from the holder's listings, newest first. */
export async function soldHistory(ctx: Pick<ServiceCtx, "db">, user: SessionUser) {
  const rows = await ctx.db.order.findMany({
    where: {
      kind: { in: ["ITEM_PURCHASE", "NFT_PURCHASE"] },
      status: "DELIVERED",
      listing: { sellerId: user.id, kind: "RESALE" },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      quantity: true,
      currency: true,
      unitPrice: true,
      txHash: true,
      createdAt: true,
      item: { select: { slug: true, title: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    quantity: row.quantity,
    currency: row.currency,
    unitPrice: row.unitPrice.toString(),
    txHash: row.txHash,
    createdAt: row.createdAt,
    item: row.item,
  }));
}
