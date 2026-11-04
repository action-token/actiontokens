import { Account, Asset, type Transaction, TransactionBuilder } from "@stellar/stellar-sdk";

import {
  applyBps,
  buildNftCancelListing,
  buildNftList,
  NFT_MAX_PER_BUY,
  type RechargeProblem,
  toAmount,
  tokenAddressOf,
  toDisplay,
  toStroops,
} from "@bandcoin/chain";
import { QUOTE_TTL_SECONDS } from "@bandcoin/chain/quote";
import { spendableXlm } from "@bandcoin/chain/server";
import { AppError, ErrorCodes } from "@bandcoin/errors";

import { type Context, isCustodial, type SessionUser } from "../../context";
import { transitionOrder } from "../order-state";
import { DEFAULT_PLATFORM_FEE_BPS } from "../admin/settings";
import { failOrder, ownOrder, userSignature } from "../purchase";

/**
 * Resale of smart-contract NFTs (the numbered editions of the nft_oz contract),
 * from the holder's side. Listing is one contract call the holder signs (`list`
 * for one copy, `list_batch` for several); it doesn't lock the copy. Putting a
 * new price on a listed copy is the same call again (the contract overwrites),
 * and taking one off sale is `cancel_listing`. The contract is not changed.
 *
 * Who gets what, as the contract settles a sale: the buyer pays the listed
 * price; out of it the platform fee goes to the treasury and the artist's
 * royalty to the artist (none when the seller is the artist); the seller gets
 * the rest, in BANDCOIN. A card buyer's USD price only sets the charge.
 */
type ServiceCtx = Pick<Context, "db" | "chain" | "activity">;

/**
 * What the holder's own list / cancel call costs them in XLM: measured on testnet
 * (a two-copy `list_batch` was about 0.17 XLM), with margin. The call's real fee
 * must fit inside what was shown, or nothing is sent.
 */
const FEE_ESTIMATE = { baseXlm: "0.25", perCopyXlm: "0.03" } as const;
const feeEstimateStroops = (copies: number) =>
  toStroops(FEE_ESTIMATE.baseXlm) + toStroops(FEE_ESTIMATE.perCopyXlm) * BigInt(copies);

const PRICE = /^\d{1,12}(\.\d{1,7})?$/;

export type NftListInput = {
  itemId: string;
  /** How many free copies to list (the lowest token numbers first) */
  amount: number;
  priceBandcoin: string;
  priceUsd: string;
  /** Put a new price on these listed copies instead of listing more */
  listingIds?: string[];
};

export type NftDetails = {
  nft: true;
  itemId: string;
  editionIds: string[];
  tokenIds: string[];
  priceBandcoin: string;
  priceUsd: string;
};

const unavailable = (message: string): RechargeProblem => ({ code: "UNAVAILABLE", message });

/** Is this a smart-contract NFT item? (Chooses between this file and the classic one.) */
export async function isNftItem(ctx: Pick<ServiceCtx, "db">, itemId: string) {
  const item = await ctx.db.item.findFirst({ where: { id: itemId }, select: { chainType: true } });
  return item?.chainType === "CONTRACT_NFT";
}

async function resalableNft(ctx: Pick<ServiceCtx, "db">, itemId: string) {
  const item = await ctx.db.item.findFirst({
    where: { id: itemId, deletedAt: null, hiddenAt: null, chainType: "CONTRACT_NFT" },
    select: {
      id: true,
      title: true,
      artist: { select: { user: { select: { walletAddress: true } } } },
      contractNft: { select: { royaltyBps: true, status: true } },
    },
  });
  if (!item?.contractNft || item.contractNft.status === "PENDING")
    throw new AppError(ErrorCodes.ITEM_NOT_AVAILABLE, { message: "This item can't be resold." });
  return item;
}

/** The fee the contract will take (it is the authority); the saved setting only if the contract can't be read. */
async function platformFeeBps(ctx: Pick<ServiceCtx, "db" | "chain">) {
  try {
    return (await ctx.chain.nftFeeSettings()).feeBps;
  } catch {
    const settings = await ctx.db.appSetting.findUnique({
      where: { id: 1 },
      select: { platformFeeBps: true },
    });
    return settings?.platformFeeBps ?? DEFAULT_PLATFORM_FEE_BPS;
  }
}

/** What the seller gets for one copy: the price less the platform fee and the artist's royalty. */
export function nftNet(price: string, feeBps: number, royaltyBps: number) {
  const cents = PRICE.test(price) ? toStroops(price) : 0n;
  const platform = applyBps(cents, feeBps);
  const royalty = applyBps(cents, royaltyBps);
  return {
    platform: toDisplay(platform),
    royalty: toDisplay(royalty),
    net: toDisplay(cents - platform - royalty),
  };
}

async function prepareList(ctx: ServiceCtx, user: SessionUser, input: NftListInput) {
  const item = await resalableNft(ctx, input.itemId);
  const problems: RechargeProblem[] = [];
  for (const [label, value] of [
    ["BANDCOIN", input.priceBandcoin],
    ["USD", input.priceUsd],
  ] as const)
    if (!PRICE.test(value) || toStroops(value) <= 0n)
      problems.push(unavailable(`Set a ${label} price above zero.`));

  const repricing = Boolean(input.listingIds?.length);
  const editions = await ctx.db.nftEdition.findMany({
    where: repricing
      ? {
          itemId: item.id,
          ownerId: user.id,
          listing: { id: { in: input.listingIds }, kind: "RESALE", status: "ACTIVE" },
        }
      : {
          itemId: item.id,
          ownerId: user.id,
          OR: [{ listing: null }, { listing: { status: { not: "ACTIVE" } } }],
        },
    orderBy: { tokenId: "asc" },
    take: repricing ? input.listingIds!.length : NFT_MAX_PER_BUY,
    select: { id: true, tokenId: true },
  });
  const wanted = repricing ? input.listingIds!.length : input.amount;
  if (!Number.isInteger(wanted) || wanted < 1 || wanted > NFT_MAX_PER_BUY)
    problems.push(unavailable(`List between 1 and ${NFT_MAX_PER_BUY} copies at a time.`));
  else if (editions.length < wanted)
    problems.push(
      unavailable(
        editions.length > 0
          ? `You have only ${editions.length} of these to ${repricing ? "reprice" : "list"}.`
          : repricing
            ? "Those listings aren't yours or have ended."
            : "You don't have a free copy of this to list.",
      ),
    );
  const chosen = editions.slice(0, Math.max(0, wanted));

  const mine = await ctx.chain.loadAccount(user.walletAddress);
  const fee = feeEstimateStroops(Math.max(1, chosen.length));
  const have = mine ? toStroops(spendableXlm(mine)) : 0n;
  if (!mine) problems.push(unavailable("Your wallet needs its first XLM before it can list."));
  else if (problems.length === 0 && have < fee)
    problems.push({
      code: "INSUFFICIENT_FUNDS",
      message: `You need ${toDisplay(fee - have)} more XLM to list this.`,
      shortfall: {
        currency: "XLM",
        need: toDisplay(fee),
        have: toDisplay(have),
        short: toDisplay(fee - have),
      },
    });

  return { item, chosen, mine, fee, problems, repricing, feeBps: await platformFeeBps(ctx) };
}

function priceOf(prepared: Awaited<ReturnType<typeof prepareList>>, input: NftListInput) {
  const { problems, fee, item, feeBps } = prepared;
  const royaltyBps = isSelf(item, prepared.mine) ? 0 : (item.contractNft?.royaltyBps ?? 0);
  const take = nftNet(input.priceBandcoin, feeBps, royaltyBps);
  return {
    ok: problems.length === 0,
    problems,
    total: toAmount(fee),
    lines: [
      {
        key: "networkFee",
        label: "Network fee",
        currency: "XLM" as const,
        amount: toDisplay(fee),
      },
      { key: "total", label: "You pay", currency: "XLM" as const, amount: toDisplay(fee) },
    ],
    note: "Copies stay in your wallet while they are listed. You can take one off sale any time.",
    willOpenStorage: false,
    copies: prepared.chosen.map((edition) => edition.tokenId),
    net: {
      royaltyPercent: String(royaltyBps / 100),
      platformPercent: String(feeBps / 100),
      /** The seller is paid in BANDCOIN; the USD price only sets what a card buyer is charged */
      bandcoin: take,
      usd: null,
    },
    expiresAt: new Date(Date.now() + QUOTE_TTL_SECONDS * 1000).toISOString(),
  };
}

/** The artist's own resale of a copy pays no royalty (the contract nets it out). */
function isSelf(
  item: { artist: { user: { walletAddress: string | null } } | null },
  mine: { accountId(): string } | null,
) {
  return Boolean(mine && item.artist?.user.walletAddress === mine.accountId());
}

export async function quoteListNft(ctx: ServiceCtx, user: SessionUser, input: NftListInput) {
  return priceOf(await prepareList(ctx, user, input), input);
}

/** Creates the order and the unsigned `list` call. Nothing is signed or sent yet. */
export async function startListNft(ctx: ServiceCtx, user: SessionUser, input: NftListInput) {
  const prepared = await prepareList(ctx, user, input);
  const quote = priceOf(prepared, input);
  if (!quote.ok || !prepared.mine)
    throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, {
      message: quote.problems[0]?.message ?? "This can't be listed right now.",
      details: { problems: quote.problems },
    });
  const { chain } = ctx;
  const contract = chain.config.nftContract;
  if (!contract)
    throw new AppError(ErrorCodes.ITEM_NOT_AVAILABLE, { message: "This item can't be resold." });

  const details: NftDetails = {
    nft: true,
    itemId: prepared.item.id,
    editionIds: prepared.chosen.map((edition) => edition.id),
    tokenIds: prepared.chosen.map((edition) => edition.tokenId),
    priceBandcoin: toDisplay(toStroops(input.priceBandcoin)),
    priceUsd: toDisplay(toStroops(input.priceUsd)),
  };
  const order = await ctx.db.order.create({
    data: {
      kind: "RESALE_LIST",
      buyerId: user.id,
      itemId: prepared.item.id,
      quantity: prepared.chosen.length,
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

  let built: { xdr: string; hash: string };
  try {
    const call = buildNftList({
      source: new Account(prepared.mine.accountId(), prepared.mine.sequenceNumber()),
      network: chain.config.network,
      contract,
      tokenIds: prepared.chosen.map((edition) => Number(edition.tokenId)),
      prices: [
        {
          paymentToken: tokenAddressOf(
            new Asset(chain.config.assets.bandcoin.code, chain.config.assets.bandcoin.issuer),
            chain.config.network.passphrase,
          ),
          price: toStroops(input.priceBandcoin),
        },
      ],
    });
    const xdr = await chain.prepareContractCall(call.xdr, []);
    const tx = TransactionBuilder.fromXDR(xdr, chain.config.network.passphrase) as Transaction;
    // The call's real fee must fit the estimate shown, or nothing is sent.
    if (BigInt(tx.fee) > prepared.fee)
      throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, {
        message:
          "The network fee is higher than shown right now. Nothing was charged; try again in a minute.",
      });
    built = { xdr, hash: Buffer.from(tx.hash()).toString("hex") };
  } catch (error) {
    await transitionOrder(ctx.db, order.id, "FAILED", {
      failureCode: ErrorCodes.STELLAR_TX_BUILD_FAILED,
    });
    throw error;
  }
  await transitionOrder(ctx.db, order.id, "AWAITING_SIGNATURE", { txHash: built.hash });
  return {
    orderId: order.id,
    quote,
    xdr: built.xdr,
    signer: isCustodial(user) ? ("custodial" as const) : ("wallet" as const),
  };
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
    await failOrder(ctx, orderId, error, null);
    throw error;
  }
}

export async function submitListNft(
  ctx: ServiceCtx,
  user: SessionUser,
  input: { orderId: string; xdr: string },
) {
  const order = await checkOrder(ctx, user, input.orderId, "RESALE_LIST");
  await send(ctx, order.id, await userSignature(ctx, user, order.txHash, input.xdr));
  return finishListNft(ctx, order.id);
}

/**
 * Records the listings once the network has accepted the call: one RESALE row
 * per copy. A copy listed before (an ended row) is reused, since an edition has
 * one listing row. Safe to run twice: only the first counts.
 */
export async function finishListNft(ctx: Pick<ServiceCtx, "db">, orderId: string) {
  return ctx.db.$transaction(async (tx) => {
    await transitionOrder(tx, orderId, "CONFIRMED");
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    const details = (order.breakdown as { resale?: NftDetails } | null)?.resale;
    if (!details?.nft || !order.buyerId)
      throw new AppError(ErrorCodes.INTERNAL, { message: "Order has no listing details" });
    let first: string | null = null;
    for (const editionId of details.editionIds) {
      const data = {
        itemId: details.itemId,
        sellerId: order.buyerId,
        kind: "RESALE" as const,
        status: "ACTIVE" as const,
        priceBandcoin: details.priceBandcoin,
        priceUsd: details.priceUsd,
        quantity: 1,
        quantitySold: 0,
      };
      const row = await tx.listing.upsert({
        where: { editionId },
        update: data,
        create: { ...data, editionId },
        select: { id: true },
      });
      first ??= row.id;
    }
    if (first) await tx.order.update({ where: { id: orderId }, data: { listingId: first } });
    await transitionOrder(tx, orderId, "DELIVERED");
    return { orderId, status: "DELIVERED" as const, listingId: first };
  });
}

/**
 * Ends listings whose copy the seller no longer owns (a listed copy isn't
 * locked, so it can be sent elsewhere). Checks the ones looked at longest ago
 * first, a batch at a time. A copy whose owner can't be read is left alone.
 */
export async function endStaleNftListings(ctx: Pick<ServiceCtx, "db" | "chain">, limit = 50) {
  const rows = await ctx.db.listing.findMany({
    where: { kind: "RESALE", status: "ACTIVE", editionId: { not: null } },
    orderBy: { updatedAt: "asc" },
    take: limit,
    select: {
      id: true,
      seller: { select: { walletAddress: true } },
      edition: { select: { tokenId: true } },
    },
  });
  let ended = 0;
  for (const row of rows) {
    if (!row.edition) continue;
    const owner = await ctx.chain.nftOwnerOf(Number(row.edition.tokenId));
    if (owner !== null && owner !== row.seller.walletAddress) {
      await ctx.db.listing.updateMany({
        where: { id: row.id, status: "ACTIVE" },
        data: { status: "CLOSED" },
      });
      ended += 1;
    } else {
      // Looked at: it goes to the back of the line.
      await ctx.db.listing.update({ where: { id: row.id }, data: { status: "ACTIVE" } });
    }
  }
  return { checked: rows.length, ended };
}

// ─── Take a copy off sale ───────────────────────────────────────────────────

async function ownNftListing(ctx: Pick<ServiceCtx, "db">, user: SessionUser, listingId: string) {
  const listing = await ctx.db.listing.findFirst({
    where: { id: listingId, sellerId: user.id, kind: "RESALE", editionId: { not: null } },
    select: {
      id: true,
      status: true,
      itemId: true,
      edition: { select: { id: true, tokenId: true, ownerId: true } },
    },
  });
  if (!listing?.edition)
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Listing not found" });
  if (listing.status !== "ACTIVE" && listing.status !== "PAUSED")
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, {
      message: "This listing has already ended.",
    });
  return { ...listing, edition: listing.edition };
}

export async function quoteCancelNft(
  ctx: ServiceCtx,
  user: SessionUser,
  input: { listingId: string },
) {
  await ownNftListing(ctx, user, input.listingId);
  const mine = await ctx.chain.loadAccount(user.walletAddress);
  const fee = feeEstimateStroops(1);
  const problems: RechargeProblem[] = [];
  const have = mine ? toStroops(spendableXlm(mine)) : 0n;
  if (!mine || have < fee)
    problems.push(unavailable("Your wallet needs a little XLM for the network fee."));
  return {
    ok: problems.length === 0,
    problems,
    copies: "1",
    total: toAmount(fee),
    lines: [
      { key: "networkFee", label: "Network fee", currency: "XLM" as const, amount: toDisplay(fee) },
    ],
    expiresAt: new Date(Date.now() + QUOTE_TTL_SECONDS * 1000).toISOString(),
  };
}

export async function startCancelNft(
  ctx: ServiceCtx,
  user: SessionUser,
  input: { listingId: string },
) {
  const listing = await ownNftListing(ctx, user, input.listingId);
  const quote = await quoteCancelNft(ctx, user, input);
  const { chain } = ctx;
  const contract = chain.config.nftContract;
  const mine = await chain.loadAccount(user.walletAddress);
  if (!quote.ok || !mine || !contract)
    throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, {
      message: quote.problems[0]?.message ?? "This can't be taken off sale right now.",
      details: { problems: quote.problems },
    });
  const order = await ctx.db.order.create({
    data: {
      kind: "RESALE_CANCEL",
      buyerId: user.id,
      itemId: listing.itemId,
      listingId: listing.id,
      quantity: 1,
      currency: "XLM",
      unitPrice: quote.total,
      platformFee: "0",
      total: quote.total,
      method: "WALLET",
      quoteExpiresAt: new Date(quote.expiresAt),
      breakdown: { resale: { nft: true, listingId: listing.id, tokenId: listing.edition.tokenId } },
    },
  });
  ctx.activity.set({
    targetType: "Order",
    targetId: order.id,
    amount: quote.total,
    currency: "XLM",
  });
  const call = buildNftCancelListing({
    source: new Account(mine.accountId(), mine.sequenceNumber()),
    network: chain.config.network,
    contract,
    tokenId: Number(listing.edition.tokenId),
  });
  const xdr = await chain.prepareContractCall(call.xdr, []);
  const tx = TransactionBuilder.fromXDR(xdr, chain.config.network.passphrase) as Transaction;
  await transitionOrder(ctx.db, order.id, "AWAITING_SIGNATURE", {
    txHash: Buffer.from(tx.hash()).toString("hex"),
  });
  return {
    closed: false as const,
    orderId: order.id,
    copies: "1",
    total: quote.total,
    xdr,
    signer: isCustodial(user) ? ("custodial" as const) : ("wallet" as const),
  };
}

export async function submitCancelNft(
  ctx: ServiceCtx,
  user: SessionUser,
  input: { orderId: string; xdr: string },
) {
  const order = await checkOrder(ctx, user, input.orderId, "RESALE_CANCEL");
  await send(ctx, order.id, await userSignature(ctx, user, order.txHash, input.xdr));
  return finishCancelNft(ctx, order.id);
}

/** The copy is off sale: its listing ends. Safe to run twice. */
export async function finishCancelNft(ctx: Pick<ServiceCtx, "db">, orderId: string) {
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
