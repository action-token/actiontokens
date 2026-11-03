import {
  Account,
  Asset,
  type Horizon,
  type Transaction,
  TransactionBuilder,
} from "@stellar/stellar-sdk";

import {
  buildNftBuyEdition,
  buildNftRegisterEdition,
  buildTopUp,
  type Currency,
  NFT_MAX_PER_BUY,
  toAmount,
  toCents,
  toDisplay,
  tokenAddressOf,
  toStroops,
  toUsd,
  usdTo,
  wrapInFeeBump,
} from "@bandcoin/chain";
import {
  QUOTE_TTL_SECONDS,
  type Quote,
  type QuoteLine,
  type QuoteProblem,
  TRUSTLINE_RESERVE_XLM,
} from "@bandcoin/chain/quote";
import { fundsOf } from "@bandcoin/chain/server";
import type { Db } from "@bandcoin/db";
import { AppError, ErrorCodes, isAppError } from "@bandcoin/errors";

import { type Context, isCustodial, type SessionUser } from "../../context";
import { notifyGuestPurchase } from "../email/guest-email";
import { DEFAULT_PLATFORM_FEE_BPS } from "../admin/settings";
import { accessOf, accessSelect, checkAccess } from "../catalog/access";
import { ensureUnlockPins } from "../catalog/unlock-pins";
import { transitionOrder } from "../order-state";
import { failOrder, holdsLine, ownOrder, userSignature } from "./index";
import { notSetUpProblems } from "./not-set-up";

/**
 * Buying copies of a contract NFT, as on the old Bandcoin: the nft_oz
 * contract mints them to the buyer and pays the creator, in one call
 * (`buy_edition`). The platform registers the edition at its first sale.
 *
 * Wallet (BANDCOIN): the buyer signs the call; the platform pays the XLM
 * network fee (fee bump) and the contract charges the buyer the same cost in
 * BANDCOIN, so the buyer needs only BANDCOIN.
 *
 * Card (email/Google/Apple accounts only): a contract call can't carry a
 * payment too, so after the card is charged it takes two transactions:
 * (1) the platform sends the buyer the BANDCOIN price (and opens their
 * BANDCOIN trustline if needed), (2) the buy. If (1) fails the card is
 * refunded; if (2) fails the buyer keeps the BANDCOIN and nothing is bought.
 * Nothing is retried.
 *
 * The network fee shown is a fixed estimate with a margin (the exact one is
 * only known by simulating, which needs the edition registered). At checkout
 * the simulated fee must fit inside it, or the order stops before anything
 * is sent.
 */
type ServiceCtx = Pick<Context, "db" | "chain" | "activity">;
type PurchaseInput = { listingId: string; quantity: number; currency: Currency };

/** What the platform expects to pay Stellar for one buy, in XLM: a base plus each copy minted. */
export const NFT_FEE_ESTIMATE = { baseXlm: "0.05", perCopyXlm: "0.01" } as const;
const READ_BACK_ATTEMPTS = 8;
const READ_BACK_DELAY_MS = 1500;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** True when this listing sells a contract NFT (the purchase router hands it here). */
export async function isNftListing(db: Db, listingId: string) {
  const row = await db.listing.findUnique({
    where: { id: listingId },
    select: { item: { select: { chainType: true } } },
  });
  return row?.item.chainType === "CONTRACT_NFT";
}

export async function loadNftSale(db: Db, listingId: string) {
  const listing = await db.listing.findUnique({
    where: { id: listingId },
    include: {
      item: {
        select: {
          id: true,
          title: true,
          description: true,
          coverUrl: true,
          supply: true,
          deletedAt: true,
          hiddenAt: true,
          ...accessSelect,
          artist: {
            select: { ...accessSelect.artist.select, user: { select: { walletAddress: true } } },
          },
          media: { select: { mediaType: true, sourceUrl: true } },
          contractNft: {
            select: { onChainEditionId: true, status: true, royaltyBps: true },
          },
        },
      },
    },
  });
  if (!listing || listing.item.deletedAt)
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "This listing doesn't exist." });
  if (listing.item.hiddenAt || listing.status !== "ACTIVE" || listing.kind !== "PRIMARY")
    throw new AppError(ErrorCodes.ITEM_NOT_AVAILABLE, {
      message: "This item isn't for sale right now.",
    });
  const creator = listing.item.artist?.user.walletAddress ?? null;
  if (!listing.item.contractNft || !creator)
    throw new AppError(ErrorCodes.ITEM_NOT_AVAILABLE, {
      message: "This item isn't for sale right now.",
    });
  const cap = listing.quantity ?? listing.item.supply;
  return {
    listing,
    item: listing.item,
    nft: listing.item.contractNft,
    creator,
    remaining: cap === null ? null : Math.max(0, cap - listing.quantitySold),
  };
}

export type NftSale = Awaited<ReturnType<typeof loadNftSale>>;

/** The platform's XLM cost for this buy (the estimate shown), in stroops. */
export const feeEstimateStroops = (quantity: number) =>
  toStroops(NFT_FEE_ESTIMATE.baseXlm) + toStroops(NFT_FEE_ESTIMATE.perCopyXlm) * BigInt(quantity);

/** Everything quote and start agree on: the lines, what the platform sends and what stands in the way. */
export async function priceNft(
  ctx: ServiceCtx,
  user: SessionUser | null,
  sale: NftSale,
  input: PurchaseInput,
  /** A guest card order: their account as it is now (null when it isn't open yet; it opens first) */
  guest?: { account: Horizon.AccountResponse | null },
) {
  const { chain } = ctx;
  const card = input.currency === "USD";
  const problems: QuoteProblem[] = [];
  const unavailable = (message: string) => problems.push({ code: "UNAVAILABLE", message });

  if (input.currency !== "BANDCOIN" && !card)
    unavailable("Contract NFTs are paid in BANDCOIN or by card.");
  if (input.quantity > NFT_MAX_PER_BUY)
    unavailable(`Up to ${NFT_MAX_PER_BUY} copies in one purchase.`);
  if (sale.remaining !== null && input.quantity > sale.remaining)
    unavailable(sale.remaining === 0 ? "Sold out." : `Only ${sale.remaining} left.`);
  // The artist may buy their own NFT (to gift it): the contract pays the price back to them.
  if (!chain.config.nftContract) unavailable("Contract NFTs aren't set up on this server yet.");

  const [buyer, settings, rates, bandcoinUsd, creatorAccount] = await Promise.all([
    guest ? guest.account : user ? chain.loadAccount(user.walletAddress) : null,
    ctx.db.appSetting.findUnique({ where: { id: 1 }, select: { platformFeeBps: true } }),
    chain.rates(),
    chain.bandcoinUsd(),
    // The contract pays the artist in the same call: their wallet has to exist.
    chain.loadAccount(sale.creator),
  ]);
  const access = accessOf(sale.item);
  const allowed = access && checkAccess(access, user ? { account: buyer } : null);
  if (allowed && !allowed.ok) unavailable(allowed.reason ?? "Not available.");
  if (user && !buyer && !guest) unavailable("Your wallet isn't active yet. Add funds first.");
  if (card && user && !isCustodial(user))
    unavailable(
      "Card works for email, Google and Apple accounts. Pay with BANDCOIN from your wallet.",
    );

  const bandcoin = new Asset(
    chain.config.assets.bandcoin.code,
    chain.config.assets.bandcoin.issuer,
  );
  const xlmUsd = toStroops(rates.xlmUsd);
  const price = {
    bandcoin: toStroops(sale.listing.priceBandcoin.toString()) * BigInt(input.quantity),
    usd: toStroops(sale.listing.priceUsd.toString()) * BigInt(input.quantity),
  };
  const buyFeeXlm = feeEstimateStroops(input.quantity);
  // Card: the BANDCOIN goes in first; a new trustline needs its reserve, and that transaction its fee.
  const openTrustline = card && !(buyer && holdsLine(buyer, bandcoin));
  const reserveXlm = openTrustline ? toStroops(TRUSTLINE_RESERVE_XLM) : 0n;
  const topUpFeeXlm = card
    ? BigInt(chain.config.network.baseFee) * BigInt(openTrustline ? 4 : 2)
    : 0n;
  // Wallet: the contract charges the buyer the platform's XLM cost, in BANDCOIN.
  const feeBandcoin = card ? 0n : usdTo(toUsd(buyFeeXlm, xlmUsd), toStroops(bandcoinUsd));

  const lines: QuoteLine[] = [
    {
      key: "price",
      label: "Item price",
      detail: `${input.quantity} × ${toDisplay(card ? toStroops(sale.listing.priceUsd.toString()) : toStroops(sale.listing.priceBandcoin.toString()))} ${card ? "USD" : "BANDCOIN"}`,
      amount: toAmount(card ? price.usd : price.bandcoin),
      currency: card ? "USD" : "BANDCOIN",
    },
  ];
  if (reserveXlm > 0n)
    lines.push({
      key: "reserve",
      label: "Trustline",
      detail: `${toDisplay(reserveXlm)} XLM, first time only`,
      hint: "Lets your wallet hold BANDCOIN, which pays for the NFT. It stays yours.",
      amount: toAmount(toUsd(reserveXlm, xlmUsd)),
      currency: "USD",
    });
  lines.push({
    key: "networkFee",
    label: "Network fee",
    detail: `about ${toDisplay(buyFeeXlm + topUpFeeXlm)} XLM, paid for you`,
    amount: toAmount(card ? toUsd(buyFeeXlm + topUpFeeXlm, xlmUsd) : feeBandcoin),
    currency: card ? "USD" : "BANDCOIN",
  });
  const total = lines.reduce((sum, line) => sum + toStroops(line.amount), 0n);
  const currency: Currency = card ? "USD" : "BANDCOIN";

  if (!user) problems.push({ code: "SIGN_IN", message: "Sign in to pay." });
  else if (!card && buyer) {
    const have = toStroops(fundsOf(buyer, chain.config.assets).BANDCOIN);
    if (have < total)
      problems.push({
        code: "INSUFFICIENT_FUNDS",
        message: `You're ${toDisplay(total - have)} BANDCOIN short.`,
        shortfall: {
          currency: "BANDCOIN",
          need: toAmount(total),
          have: toAmount(have),
          short: toAmount(total - have),
        },
      });
  }

  const shown = creatorAccount ? problems : notSetUpProblems();
  const feeBps = settings?.platformFeeBps ?? DEFAULT_PLATFORM_FEE_BPS;
  const platform = (price.bandcoin * BigInt(feeBps) + 9_999n) / 10_000n;
  const quote: Quote = {
    currency,
    quantity: input.quantity,
    unitPrice: card ? sale.listing.priceUsd.toString() : sale.listing.priceBandcoin.toString(),
    rateUsd: null,
    lines,
    totals: [{ currency, amount: toAmount(total) }],
    // The contract takes the platform fee out of the creator's share; the buyer doesn't pay it.
    payout: {
      seller: toAmount(price.bandcoin - platform),
      royalty: "0.0000000",
      platform: toAmount(platform),
    },
    cardSettlement: null,
    ok: shown.length === 0,
    problems: shown,
    expiresAt: new Date(Date.now() + QUOTE_TTL_SECONDS * 1000).toISOString(),
  };
  return { quote, buyer, bandcoin, price, feeBandcoin, buyFeeXlm, openTrustline, reserveXlm };
}

export async function quoteNftPurchase(
  ctx: ServiceCtx,
  user: SessionUser | null,
  input: PurchaseInput,
) {
  return (await priceNft(ctx, user, await loadNftSale(ctx.db, input.listingId), input)).quote;
}

/**
 * The edition's id on the contract, registering it first if this is its first
 * sale: the platform's treasury is the price authority, signs and pays.
 */
export async function ensureRegistered(ctx: ServiceCtx, sale: NftSale): Promise<number> {
  const { chain, db } = ctx;
  if (sale.nft.onChainEditionId) return Number(sale.nft.onChainEditionId);
  const mark = (editionId: number) =>
    db.contractNft.update({
      where: { itemId: sale.item.id },
      data: { onChainEditionId: String(editionId), status: "MINTED" },
    });
  const already = await chain.editionIdByRef(sale.item.id).catch(() => null);
  if (already !== null) {
    await mark(already);
    return already;
  }

  const contract = chain.config.nftContract;
  const treasury = await chain.loadAccount(chain.config.treasury);
  if (!contract || !treasury)
    throw new AppError(ErrorCodes.CONFIG_MISSING, {
      message: "Contract NFTs aren't set up on this server yet.",
    });
  const bandcoin = new Asset(
    chain.config.assets.bandcoin.code,
    chain.config.assets.bandcoin.issuer,
  );
  const built = buildNftRegisterEdition({
    source: new Account(treasury.accountId(), treasury.sequenceNumber()),
    network: chain.config.network,
    contract,
    caller: chain.config.treasury,
    editionRef: sale.item.id,
    title: sale.item.title,
    description: sale.item.description ?? "",
    thumbnailUrl: sale.item.coverUrl,
    mediaUrl: sale.item.media?.sourceUrl ?? sale.item.coverUrl,
    mediaType: sale.item.media?.mediaType ?? "IMAGE",
    creator: sale.creator,
    royaltyBps: sale.nft.royaltyBps,
    supply: sale.item.supply ?? 1,
    prices: [
      {
        paymentToken: tokenAddressOf(bandcoin, chain.config.network.passphrase),
        price: toStroops(sale.listing.priceBandcoin.toString()),
      },
    ],
  });
  const prepared = await chain.prepareContractCall(built.xdr, [chain.config.treasury]);
  const signed = await chain.signWithServerKeys(prepared, [chain.config.treasury]);
  try {
    await chain.submit(signed);
  } catch (error) {
    // Another buyer's purchase may have registered it a moment ago: the read below settles it.
    console.error("[nft] registration submit failed", { itemId: sale.item.id, error });
  }
  for (let attempt = 0; attempt < READ_BACK_ATTEMPTS; attempt++) {
    const editionId = await chain.editionIdByRef(sale.item.id).catch(() => null);
    if (editionId !== null) {
      await mark(editionId);
      return editionId;
    }
    await sleep(READ_BACK_DELAY_MS);
  }
  throw new AppError(ErrorCodes.STELLAR_TX_SUBMIT_FAILED, {
    message:
      "Couldn't put this NFT on Stellar just now. Nothing was charged; try again in a minute.",
  });
}

/** The buy itself: the buyer is the source and signs; the treasury authorises it (prepare) and fee-bumps it. */
async function prepareBuy(
  ctx: ServiceCtx,
  buyer: Horizon.AccountResponse,
  order: { id: string; itemId: string },
  quantity: number,
  networkFee: bigint,
  budget: bigint,
) {
  const { chain } = ctx;
  const bandcoin = new Asset(
    chain.config.assets.bandcoin.code,
    chain.config.assets.bandcoin.issuer,
  );
  const built = buildNftBuyEdition({
    source: new Account(buyer.accountId(), buyer.sequenceNumber()),
    network: chain.config.network,
    contract: chain.config.nftContract!,
    editionRef: order.itemId,
    purchaseRef: order.id,
    paymentToken: tokenAddressOf(bandcoin, chain.config.network.passphrase),
    quantity,
    inclusionFee: 0n,
    networkFee,
    treasury: chain.config.treasury,
  });
  const prepared = await chain.prepareContractCall(built.xdr, [chain.config.treasury]);
  const tx = TransactionBuilder.fromXDR(prepared, chain.config.network.passphrase) as Transaction;
  // What the treasury will pay: the call's fee plus the fee bump's own.
  const cost = BigInt(tx.fee) + BigInt(chain.config.network.baseFee);
  if (cost > budget)
    throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, {
      message:
        "The network fee is higher than shown right now. Nothing was charged; try again in a minute.",
    });
  return { xdr: prepared, hash: Buffer.from(tx.hash()).toString("hex") };
}

/** Card, step 1's transaction: the treasury sends the BANDCOIN (and any trustline reserve) to the buyer. */
export function buildNftTopUp(
  ctx: Pick<ServiceCtx, "chain">,
  priced: Pick<
    Awaited<ReturnType<typeof priceNft>>,
    "bandcoin" | "price" | "openTrustline" | "reserveXlm"
  >,
  buyer: Horizon.AccountResponse,
  orderId: string,
) {
  const topUp = buildTopUp({
    buyer: new Account(buyer.accountId(), buyer.sequenceNumber()),
    network: ctx.chain.config.network,
    orderId,
    asset: priced.bandcoin,
    from: ctx.chain.config.treasury,
    amount: toAmount(priced.price.bandcoin),
    openTrustline: priced.openTrustline,
    reserveXlm: priced.reserveXlm > 0n ? toAmount(priced.reserveXlm) : undefined,
  });
  return { xdr: topUp.xdr, hash: topUp.hash };
}

/** Creates the order and the transaction the buyer signs. Nothing is signed, sent or charged yet. */
export async function startNftPurchase(ctx: ServiceCtx, user: SessionUser, input: PurchaseInput) {
  const sale = await loadNftSale(ctx.db, input.listingId);
  const priced = await priceNft(ctx, user, sale, input);
  const { quote, buyer } = priced;
  if (!quote.ok || !buyer)
    throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, {
      message: quote.problems[0]?.message ?? "This purchase can't go through right now.",
      details: { problems: quote.problems },
    });
  await ensureRegistered(ctx, sale);

  const card = input.currency === "USD";
  const total = quote.totals[0]!.amount;
  const order = await ctx.db.order.create({
    data: {
      kind: "NFT_PURCHASE",
      buyerId: user.id,
      listingId: sale.listing.id,
      itemId: sale.item.id,
      quantity: input.quantity,
      currency: input.currency,
      unitPrice: quote.unitPrice,
      platformFee: quote.payout.platform,
      total,
      method: card ? "CARD" : "WALLET",
      quoteExpiresAt: new Date(quote.expiresAt),
      breakdown: {
        ...quote,
        nft: {
          bandcoin: toAmount(priced.price.bandcoin),
          feeBandcoin: toAmount(priced.feeBandcoin),
          budgetXlm: toAmount(priced.buyFeeXlm),
          openTrustline: priced.openTrustline,
          reserveXlm: toAmount(priced.reserveXlm),
        },
      },
      sellerAmount: quote.payout.seller,
      royaltyAmount: "0",
    },
  });
  ctx.activity.set({
    targetType: "Order",
    targetId: order.id,
    amount: total,
    currency: input.currency,
  });

  let built: { xdr: string; hash: string };
  try {
    built = card
      ? buildNftTopUp(ctx, priced, buyer, order.id)
      : await prepareBuy(
          ctx,
          buyer,
          { id: order.id, itemId: sale.item.id },
          input.quantity,
          priced.feeBandcoin,
          priced.buyFeeXlm,
        );
  } catch (error) {
    await transitionOrder(ctx.db, order.id, "FAILED", {
      failureCode: isAppError(error) ? error.code : ErrorCodes.STELLAR_TX_BUILD_FAILED,
    });
    throw error;
  }
  // The hash doesn't change when signatures are added, so it pins the exact transaction.
  await transitionOrder(ctx.db, order.id, "AWAITING_SIGNATURE", { txHash: built.hash });
  return {
    orderId: order.id,
    quote,
    xdr: built.xdr,
    signer: isCustodial(user) ? ("custodial" as const) : ("wallet" as const),
  };
}

type NftBreakdown = { nft: { bandcoin: string; budgetXlm: string } };

/**
 * Sends it. Wallet: the signed buy, fee-bumped by the treasury. Card: the card
 * is charged, the BANDCOIN goes in (refunded if that fails), then the buy.
 */
export async function submitNftPurchase(
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
  if (order.kind !== "NFT_PURCHASE")
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Order not found" });
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

  const { treasury, network } = chain.config;
  const signed = await userSignature(ctx, user, order.txHash, input.xdr);
  const card = order.method === "CARD";
  const bumped = async (xdr: string) =>
    chain.signWithServerKeys(wrapInFeeBump(xdr, treasury, network), [treasury]);

  if (!card) {
    const outgoing = await bumped(signed);
    await transitionOrder(db, order.id, "SUBMITTED");
    await send(ctx, order.id, outgoing, null);
    return deliverWhenVisible(ctx, order.id);
  }

  // Card, step 1: charge, then the BANDCOIN goes in. A failure here refunds the card.
  if (!input.card)
    throw new AppError(ErrorCodes.VALIDATION_FAILED, { message: "Add a card to pay." });
  if (!user.email) throw new AppError(ErrorCodes.WALLET_NOT_CONNECTED);
  const { paymentId } = await chain.card.charge({
    orderId: order.id,
    sourceId: input.card.sourceId,
    verificationToken: input.card.verificationToken,
    cents: toCents(toStroops(order.total.toString())),
  });
  await transitionOrder(db, order.id, "SUBMITTED", { cardPaymentId: paymentId });
  return runCardNftSteps(ctx, order, signed, paymentId, {
    email: user.email,
    walletAddress: user.walletAddress,
  });
}

/**
 * A card NFT order after the charge: the BANDCOIN goes in (`signedTopUp`, the
 * buyer's signature on it; a failure refunds the card), then the buy (a
 * failure keeps the BANDCOIN with the buyer, no refund, no retry).
 */
export async function runCardNftSteps(
  ctx: ServiceCtx,
  order: {
    id: string;
    itemId: string | null;
    quantity: number;
    breakdown: unknown;
    total: { toString(): string };
  },
  signedTopUp: string,
  paymentId: string,
  buyer: { email: string; walletAddress: string },
) {
  const { chain, db } = ctx;
  const { treasury, network } = chain.config;
  const bumped = async (xdr: string) =>
    chain.signWithServerKeys(wrapInFeeBump(xdr, treasury, network), [treasury]);
  const topUp = await bumped(await chain.signWithServerKeys(signedTopUp, [treasury]));
  await send(ctx, order.id, topUp, { paymentId, total: order.total.toString() });

  // Step 2: the buy. The BANDCOIN is already the buyer's, so a failure keeps it there.
  const details = (order.breakdown as NftBreakdown).nft;
  try {
    const account = await chain.loadAccount(buyer.walletAddress);
    if (!account) throw new AppError(ErrorCodes.STELLAR_TX_BUILD_FAILED);
    const buy = await prepareBuy(
      ctx,
      account,
      { id: order.id, itemId: order.itemId! },
      order.quantity,
      0n,
      toStroops(details.budgetXlm),
    );
    await chain.submit(await bumped(await chain.signForCustodialUser(buy.xdr, buyer.email)));
  } catch (error) {
    // A lost answer may still have landed: the worker reads the contract's receipt.
    if (isAppError(error) && error.code === ErrorCodes.STELLAR_TX_SUBMIT_FAILED) throw error;
    await transitionOrder(db, order.id, "FAILED", { failureCode: "NFT_BUY_FAILED_FUNDED" });
    throw new AppError(ErrorCodes.STELLAR_TX_REJECTED, {
      message: `Your card payment became ${toDisplay(toStroops(details.bandcoin))} BANDCOIN in your wallet, but the NFT couldn't be bought. Nothing else was charged; you can buy it with that BANDCOIN.`,
    });
  }
  return deliverWhenVisible(ctx, order.id);
}

/** Submits one transaction; a rejection fails the order (refunding a card), a lost answer leaves it SUBMITTED. */
async function send(
  ctx: ServiceCtx,
  orderId: string,
  xdr: string,
  card: { paymentId: string; total: string } | null,
) {
  try {
    const { hash } = await ctx.chain.submit(xdr);
    ctx.activity.set({ txHash: hash });
  } catch (error) {
    if (isAppError(error) && error.code === ErrorCodes.STELLAR_TX_SUBMIT_FAILED) throw error;
    await failOrder(ctx, orderId, error, card);
    throw error;
  }
}

/** Delivers once the contract's receipt shows; if it's slow, the worker finishes it. */
async function deliverWhenVisible(ctx: ServiceCtx, orderId: string) {
  for (let attempt = 0; attempt < READ_BACK_ATTEMPTS; attempt++) {
    const finished = await finishNftPurchase(ctx, orderId).catch(() => null);
    if (finished?.status === "DELIVERED") return finished;
    await sleep(READ_BACK_DELAY_MS);
  }
  return { orderId, status: "SUBMITTED" as const };
}

/**
 * Records the copies the contract minted for this order (its purchase ref):
 * one NftEdition per token, the buyer's ownership and the listing's count.
 * Runs once: the CONFIRMED transition guards it. Without a receipt yet it
 * leaves the order as it is.
 */
export async function finishNftPurchase(ctx: Pick<Context, "db" | "chain">, orderId: string) {
  // A failed read throws: "no receipt" must only ever mean the contract has none.
  const receipt = await ctx.chain.nftPurchaseByRef(orderId);
  if (!receipt) return { orderId, status: "SUBMITTED" as const };
  const tokenIds = Array.from(
    { length: receipt.lastTokenId - receipt.firstTokenId + 1 },
    (_, index) => String(receipt.firstTokenId + index),
  );
  const order = await ctx.db.$transaction(async (tx) => {
    await transitionOrder(tx, orderId, "CONFIRMED");
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    if (!order.buyerId || !order.itemId) throw new AppError(ErrorCodes.INTERNAL);
    await tx.nftEdition.createMany({
      data: tokenIds.map((tokenId) => ({
        itemId: order.itemId!,
        tokenId,
        ownerId: order.buyerId!,
      })),
      skipDuplicates: true,
    });
    await tx.ownership.upsert({
      where: { userId_itemId: { userId: order.buyerId, itemId: order.itemId } },
      create: {
        userId: order.buyerId,
        itemId: order.itemId,
        quantity: tokenIds.length,
        source: "PURCHASE",
      },
      update: { quantity: { increment: tokenIds.length } },
    });
    await tx.contractNft.update({
      where: { itemId: order.itemId },
      data: { onChainEditionId: String(receipt.editionId), status: "MINTED" },
    });
    if (order.listingId) {
      const listing = await tx.listing.update({
        where: { id: order.listingId },
        data: { quantitySold: { increment: tokenIds.length } },
        include: { item: { select: { supply: true } } },
      });
      const cap = listing.quantity ?? listing.item.supply;
      if (cap !== null && listing.quantitySold >= cap)
        await tx.listing.update({ where: { id: listing.id }, data: { status: "SOLD_OUT" } });
    }
    await transitionOrder(tx, orderId, "DELIVERED");
    return order;
  });
  // The places to visit for each new copy. Outside the transaction (it can be
  // many pins); anything missing is made when the owner opens the item.
  try {
    const editions = await ctx.db.nftEdition.findMany({
      where: { tokenId: { in: tokenIds } },
      select: { id: true, ownerId: true },
    });
    await ensureUnlockPins(ctx.db, order.itemId!, editions);
  } catch (error) {
    console.error("[nft] unlock pins not made yet", { orderId, error });
  }
  if (order.guestEmail)
    await notifyGuestPurchase(ctx, {
      guestEmail: order.guestEmail,
      itemId: order.itemId,
      quantity: tokenIds.length,
    });
  return { orderId, status: "DELIVERED" as const };
}
