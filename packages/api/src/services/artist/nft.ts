import { Account, Asset, type Transaction, TransactionBuilder } from "@stellar/stellar-sdk";

import {
  buildNftRegisterEdition,
  NFT_MAX_SUPPLY,
  type RechargeProblem,
  toAmount,
  toDisplay,
  toStroops,
  tokenAddressOf,
} from "@bandcoin/chain";
import { QUOTE_TTL_SECONDS } from "@bandcoin/chain/quote";
import { fundsOf } from "@bandcoin/chain/server";
import { AppError, ErrorCodes, isAppError } from "@bandcoin/errors";
import { slugFromName } from "@bandcoin/utils/slug";

import { type Context, isCustodial, type SessionUser } from "../../context";
import { transitionOrder } from "../order-state";
import { failOrder, ownOrder, userSignature } from "../purchase";
import {
  checkOwnUrls,
  checkPrices,
  type CreateItemInput,
  freeSlug,
  invalid,
  NEEDS_FILE,
} from "./items";

/**
 * Contract NFTs. An NFT is saved as an unpublished draft first, then the artist
 * pays the small network fee to register it on the nft_oz contract (the platform's
 * treasury authorises the registration, the artist is the transaction's source, so the
 * platform pays nothing). Copies are minted when fans buy.
 *
 *   createNftDraft  → saves the item (DB only)
 *   quote           → asks the contract to simulate the registration, so the exact fee
 *                     shows and a bad edition fails before anyone signs
 *   start / submit  → the same order flow as every wallet payment
 */
type ServiceCtx = Pick<Context, "db" | "chain" | "activity">;
type ArtistRef = { id: string; slug: string };

const NOT_SET_UP = "Contract NFTs aren't set up on this server yet.";
const ALREADY = "This NFT is already registered.";

export type CreateNftInput = Omit<
  CreateItemInput,
  "code" | "supply" | "visibility" | "royaltyPercent" | "type"
> & {
  type: Exclude<CreateItemInput["type"], "ROYALTY">;
  supply: number;
  /** What the artist earns each time a copy is resold, 0 to 90 */
  resaleRoyaltyPercent: string;
};

export async function createNftDraft(
  ctx: Pick<ServiceCtx, "db" | "chain" | "activity">,
  artist: ArtistRef,
  user: { id: string },
  input: CreateNftInput,
) {
  const contract = ctx.chain.config.nftContract;
  if (!contract) throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, { message: NOT_SET_UP });
  if (!Number.isInteger(input.supply) || input.supply < 1 || input.supply > NFT_MAX_SUPPLY)
    throw invalid("Use a whole number from 1 to 100,000.");
  const royalty = Number(input.resaleRoyaltyPercent);
  if (!(royalty >= 0 && royalty <= 90)) throw invalid("Resale royalty can be from 0 to 90%.");
  checkPrices(input);
  checkOwnUrls({ cover: input.coverUrl, file: input.media?.url });
  if (NEEDS_FILE.includes(input.type) && !input.media)
    throw invalid("Add the file people will get.");

  const item = await ctx.db.item.create({
    data: {
      type: input.type,
      chainType: "CONTRACT_NFT",
      title: input.title.trim(),
      slug: await freeSlug(ctx.db, `${artist.slug}-${slugFromName(input.title)}`),
      description: input.description?.trim() || null,
      coverUrl: input.coverUrl,
      visibility: "DRAFT",
      supply: input.supply,
      artistId: artist.id,
      createdById: user.id,
      contractNft: {
        create: {
          contractAddress: contract,
          royaltyBps: Math.round(royalty * 100),
          status: "PENDING",
        },
      },
      ...(input.media
        ? { media: { create: { mediaType: input.media.mediaType, sourceUrl: input.media.url } } }
        : {}),
      listings: {
        create: {
          sellerId: user.id,
          kind: "PRIMARY",
          status: "PAUSED",
          priceBandcoin: input.priceBandcoin,
          priceUsd: input.priceUsd,
        },
      },
    },
    select: { id: true, slug: true },
  });
  ctx.activity.set({ targetType: "Item", targetId: item.id });
  return { itemId: item.id, slug: item.slug };
}

async function ownNft(ctx: ServiceCtx, artist: Pick<ArtistRef, "id">, itemId: string) {
  const item = await ctx.db.item.findFirst({
    where: { id: itemId, artistId: artist.id, deletedAt: null, chainType: "CONTRACT_NFT" },
    select: {
      id: true,
      title: true,
      description: true,
      coverUrl: true,
      supply: true,
      media: { select: { mediaType: true, sourceUrl: true } },
      contractNft: { select: { status: true, royaltyBps: true } },
      listings: { where: { kind: "PRIMARY" }, take: 1, select: { priceBandcoin: true } },
    },
  });
  if (!item?.contractNft)
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Item not found" });
  ctx.activity.set({ targetType: "Item", targetId: item.id });
  return { ...item, contractNft: item.contractNft };
}

/** Records the edition id on the item once the contract has it. */
const markRegistered = (ctx: ServiceCtx, itemId: string, editionId: number) =>
  ctx.db.contractNft.update({
    where: { itemId },
    data: { onChainEditionId: String(editionId), status: "MINTED" },
  });

async function prepareRegistration(
  ctx: ServiceCtx,
  user: SessionUser,
  artist: Pick<ArtistRef, "id">,
  itemId: string,
) {
  const { chain } = ctx;
  const item = await ownNft(ctx, artist, itemId);
  const contract = chain.config.nftContract;

  const unavailable = (message: string) => ({
    item,
    problems: [{ code: "UNAVAILABLE", message }] satisfies RechargeProblem[],
    prepared: null,
    fee: 0n,
    funds: null as string | null,
  });
  if (!contract) return unavailable(NOT_SET_UP);
  if (item.contractNft.status === "MINTED") return unavailable(ALREADY);
  // A payment that landed but wasn't recorded (the app closed, the read failed): finish it here.
  const onChain = await chain.editionIdByRef(item.id).catch(() => null);
  if (onChain !== null) {
    await markRegistered(ctx, item.id, onChain);
    return unavailable(ALREADY);
  }

  const account = await chain.loadAccount(user.walletAddress);
  const funds = fundsOf(account, chain.config.assets).XLM;
  if (!account) return unavailable("Your wallet needs its first XLM before it can pay.");

  const bandcoin = new Asset(
    chain.config.assets.bandcoin.code,
    chain.config.assets.bandcoin.issuer,
  );
  const built = buildNftRegisterEdition({
    source: new Account(account.accountId(), account.sequenceNumber()),
    network: chain.config.network,
    contract,
    caller: chain.config.treasury,
    editionRef: item.id,
    title: item.title,
    description: item.description ?? "",
    thumbnailUrl: item.coverUrl,
    mediaUrl: item.media?.sourceUrl ?? item.coverUrl,
    mediaType: item.media?.mediaType ?? "IMAGE",
    creator: user.walletAddress,
    royaltyBps: item.contractNft.royaltyBps,
    supply: item.supply ?? 1,
    prices: [
      {
        paymentToken: tokenAddressOf(bandcoin, chain.config.network.passphrase),
        price: toStroops(item.listings[0]?.priceBandcoin.toString() ?? "0"),
      },
    ],
  });
  try {
    const prepared = await chain.prepareContractCall(built.xdr, built.serverSigners);
    const fee = BigInt(
      (TransactionBuilder.fromXDR(prepared, chain.config.network.passphrase) as Transaction).fee,
    );
    return { item, problems: [] as RechargeProblem[], prepared, fee, funds };
  } catch {
    return unavailable("The contract rejected this edition. Check the details and try again.");
  }
}

function priceRegistration(prepared: Awaited<ReturnType<typeof prepareRegistration>>) {
  const problems = [...prepared.problems];
  if (problems.length === 0 && prepared.funds !== null) {
    const have = toStroops(prepared.funds);
    if (have < prepared.fee) {
      problems.push({
        code: "INSUFFICIENT_FUNDS",
        message: `You need ${toDisplay(prepared.fee - have)} more XLM to register this NFT.`,
        shortfall: {
          currency: "XLM",
          need: toDisplay(prepared.fee),
          have: toDisplay(have),
          short: toDisplay(prepared.fee - have),
        },
      });
    }
  }
  return {
    ok: problems.length === 0,
    problems,
    total: toAmount(prepared.fee),
    lines: [
      { key: "networkFee", label: "Network fee", currency: "XLM", amount: toDisplay(prepared.fee) },
      { key: "total", label: "You pay", currency: "XLM", amount: toDisplay(prepared.fee) },
    ],
    expiresAt: new Date(Date.now() + QUOTE_TTL_SECONDS * 1000).toISOString(),
  };
}

export async function quoteNftRegistration(
  ctx: ServiceCtx,
  user: SessionUser,
  artist: Pick<ArtistRef, "id">,
  itemId: string,
) {
  return priceRegistration(await prepareRegistration(ctx, user, artist, itemId));
}

/** Creates the order and the unsigned registration. Nothing is signed or sent yet. */
export async function startNftRegistration(
  ctx: ServiceCtx,
  user: SessionUser,
  artist: Pick<ArtistRef, "id">,
  itemId: string,
) {
  const prepared = await prepareRegistration(ctx, user, artist, itemId);
  const quote = priceRegistration(prepared);
  if (!quote.ok || !prepared.prepared) {
    throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, {
      message: quote.problems[0]?.message ?? "This can't go through right now.",
      details: { problems: quote.problems },
    });
  }
  const order = await ctx.db.order.create({
    data: {
      kind: "NFT_REGISTER",
      buyerId: user.id,
      currency: "XLM",
      unitPrice: quote.total,
      platformFee: "0",
      total: quote.total,
      method: "WALLET",
      quoteExpiresAt: new Date(quote.expiresAt),
      breakdown: { ...quote, itemId: prepared.item.id },
    },
  });
  ctx.activity.set({
    targetType: "Order",
    targetId: order.id,
    amount: quote.total,
    currency: "XLM",
  });

  const hash = Buffer.from(
    (
      TransactionBuilder.fromXDR(
        prepared.prepared,
        ctx.chain.config.network.passphrase,
      ) as Transaction
    ).hash(),
  ).toString("hex");
  // The hash doesn't change when the artist signs, so it pins the exact transaction.
  await transitionOrder(ctx.db, order.id, "AWAITING_SIGNATURE", { txHash: hash });
  return {
    orderId: order.id,
    quote,
    xdr: prepared.prepared,
    signer: isCustodial(user) ? ("custodial" as const) : ("wallet" as const),
  };
}

const READ_BACK_ATTEMPTS = 6;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function submitNftRegistration(
  ctx: ServiceCtx,
  user: SessionUser,
  input: { orderId: string; xdr: string },
  options: { retryDelayMs?: number } = {},
) {
  const { chain, db } = ctx;
  const order = await ownOrder(ctx, user, input.orderId);
  if (order.kind !== "NFT_REGISTER")
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Order not found" });
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

  const itemId = (order.breakdown as { itemId?: string } | null)?.itemId;
  if (!itemId) throw new AppError(ErrorCodes.INTERNAL, { message: "This order has no item." });
  // The contract's answer shows up a moment after the payment; the next quote finishes this if it doesn't here.
  for (let attempt = 0; attempt < READ_BACK_ATTEMPTS; attempt += 1) {
    const editionId = await chain.editionIdByRef(itemId).catch(() => null);
    if (editionId !== null) {
      await markRegistered(ctx, itemId, editionId);
      await transitionOrder(db, order.id, "CONFIRMED");
      await transitionOrder(db, order.id, "DELIVERED");
      return { orderId: order.id, status: "DELIVERED" as const };
    }
    await sleep(options.retryDelayMs ?? 1000);
  }
  throw new AppError(ErrorCodes.EXTERNAL_SERVICE_FAILED, {
    message: "Your NFT is registered, but we couldn't confirm it yet. Refresh in a moment.",
  });
}
