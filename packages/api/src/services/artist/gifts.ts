import { Account, Asset } from "@stellar/stellar-sdk";
import type { Horizon } from "@stellar/stellar-sdk";

import {
  buildIssueTokens,
  networkFeeXlm,
  type RechargeProblem,
  toAmount,
  toDisplay,
  toStroops,
} from "@bandcoin/chain";
import { QUOTE_TTL_SECONDS } from "@bandcoin/chain/quote";
import { fundsOf } from "@bandcoin/chain/server";
import { AppError, ErrorCodes, isAppError } from "@bandcoin/errors";

import { type Context, type SessionUser, isCustodial } from "../../context";
import { transitionOrder } from "../order-state";
import { failOrder, ownOrder, userSignature } from "../purchase";

/**
 * Gifts: an artist gives some of their fan token to a fan, for example to
 * lift them into a membership tier. The new tokens are issued straight to the
 * fan's wallet. The artist's wallet is the transaction's source, so they pay
 * the network fee and nothing else; the platform's issuer key only co-signs.
 *
 * Version 1 covers fan tokens issued by the artist's own Bandcoin account,
 * sent to Bandcoin fans who already trust the token. Collectibles, fans
 * without a trustline and email invites come later.
 */
type ServiceCtx = Pick<Context, "db" | "chain" | "activity">;
type ArtistRef = { id: string; fanTokenItemId: string | null };

export const MAX_GIFT = 1_000_000;
const MAX_FOLLOWERS_SHOWN = 50;
const unavailable = (message: string): RechargeProblem => ({ code: "UNAVAILABLE", message });

type Recipient = { id: string; name: string | null; image: string | null; walletAddress: string };
export type GiftBreakdown = {
  itemId: string;
  recipientId: string;
  recipientWallet: string;
  code: string;
  issuer: string;
  amount: number;
};

const holdsTrustline = (account: Horizon.AccountResponse, code: string, issuer: string) =>
  account.balances.some(
    (balance) =>
      "asset_code" in balance && balance.asset_code === code && balance.asset_issuer === issuer,
  );

const nameOf = (user: { username: string | null; displayName: string | null }) =>
  user.displayName ?? user.username;

/** A fan from what the artist typed: a wallet address, an email, or a username. */
export async function findRecipient(
  ctx: Pick<ServiceCtx, "db">,
  text: string,
): Promise<Recipient | null> {
  const value = text.trim();
  if (!value) return null;
  const where = /^G[A-Z2-7]{55}$/.test(value)
    ? { walletAddress: value }
    : value.includes("@") && !value.startsWith("@")
      ? { email: { equals: value, mode: "insensitive" as const } }
      : { username: { equals: value.replace(/^@/, ""), mode: "insensitive" as const } };
  const user = await ctx.db.user.findFirst({
    where,
    select: { id: true, username: true, displayName: true, avatarUrl: true, walletAddress: true },
  });
  return user?.walletAddress
    ? { id: user.id, name: nameOf(user), image: user.avatarUrl, walletAddress: user.walletAddress }
    : null;
}

async function prepare(
  ctx: ServiceCtx,
  user: SessionUser,
  artist: ArtistRef,
  input: { recipient: string; amount: number },
) {
  const { chain, db } = ctx;
  const problems: RechargeProblem[] = [];

  const token = artist.fanTokenItemId
    ? await db.classicToken.findUnique({
        where: { itemId: artist.fanTokenItemId },
        select: {
          itemId: true,
          code: true,
          issuer: true,
          isExternal: true,
          issuerAccount: { select: { publicKey: true } },
        },
      })
    : null;
  if (!token)
    problems.push(unavailable("Create your fan token first (Memberships), then you can gift it."));
  else if (token.isExternal || !token.issuerAccount)
    problems.push(
      unavailable(
        "Gifts work for tokens issued by your Bandcoin artist account. Yours was issued elsewhere.",
      ),
    );

  if (!Number.isInteger(input.amount) || input.amount < 1 || input.amount > MAX_GIFT)
    problems.push(
      unavailable(`Gift a whole number of tokens, from 1 to ${MAX_GIFT.toLocaleString("en-US")}.`),
    );

  const recipient = await findRecipient(ctx, input.recipient);
  if (!input.recipient.trim()) problems.push(unavailable("Choose who to send it to."));
  else if (!recipient)
    problems.push(
      unavailable("We couldn't find a Bandcoin fan with that username, email or wallet."),
    );
  else if (recipient.id === user.id)
    problems.push(unavailable("You can't gift tokens to yourself."));

  const account = await chain.loadAccount(user.walletAddress);
  if (!account)
    problems.push(
      unavailable("Your wallet needs its first XLM before it can pay the network fee."),
    );

  if (token && recipient && recipient.id !== user.id && !token.isExternal) {
    const theirs = await chain.loadAccount(recipient.walletAddress);
    if (!theirs || !holdsTrustline(theirs, token.code, token.issuer)) {
      problems.push(
        unavailable(
          `${recipient.name ?? "This fan"} hasn't added your token to their wallet yet, so it can't be sent to them. Ask them to follow you and open your page, then try again.`,
        ),
      );
    }
  }

  const fee = toStroops(networkFeeXlm(1, chain.config.network.baseFee));
  const xlm = fundsOf(account, chain.config.assets).XLM;
  if (problems.length === 0 && xlm !== null) {
    const have = toStroops(xlm);
    if (have < fee) {
      problems.push({
        code: "INSUFFICIENT_FUNDS",
        message: `You need ${toDisplay(fee - have)} more XLM to pay the network fee.`,
        shortfall: {
          currency: "XLM",
          need: toDisplay(fee),
          have: toDisplay(have),
          short: toDisplay(fee - have),
        },
      });
    }
  }
  return { token, recipient, account, fee, problems };
}

function priceOf(prepared: Awaited<ReturnType<typeof prepare>>, input: { amount: number }) {
  const { token, recipient, fee, problems } = prepared;
  return {
    ok: problems.length === 0,
    problems,
    total: toAmount(fee),
    lines: [
      { key: "networkFee", label: "Network fee", currency: "XLM", amount: toDisplay(fee) },
      { key: "total", label: "You pay", currency: "XLM", amount: toDisplay(fee) },
    ],
    /** What is being given, shown next to the price: the gift itself costs nothing, it is newly issued */
    gift: {
      amount: input.amount,
      code: token?.code ?? null,
      recipient: recipient
        ? { id: recipient.id, name: recipient.name, image: recipient.image }
        : null,
    },
    expiresAt: new Date(Date.now() + QUOTE_TTL_SECONDS * 1000).toISOString(),
  };
}

export async function quoteGift(
  ctx: ServiceCtx,
  user: SessionUser,
  artist: ArtistRef,
  input: { recipient: string; amount: number },
) {
  return priceOf(await prepare(ctx, user, artist, input), input);
}

/** Creates the order and the unsigned transaction. Nothing is signed or sent yet. */
export async function startGift(
  ctx: ServiceCtx,
  user: SessionUser,
  artist: ArtistRef,
  input: { recipient: string; amount: number },
) {
  const prepared = await prepare(ctx, user, artist, input);
  const quote = priceOf(prepared, input);
  const { token, recipient, account } = prepared;
  if (!quote.ok || !token?.issuerAccount || !recipient || !account) {
    throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, {
      message: quote.problems[0]?.message ?? "This can't go through right now.",
      details: { problems: quote.problems },
    });
  }

  const gift: GiftBreakdown = {
    itemId: token.itemId,
    recipientId: recipient.id,
    recipientWallet: recipient.walletAddress,
    code: token.code,
    issuer: token.issuer,
    amount: input.amount,
  };
  const order = await ctx.db.order.create({
    data: {
      kind: "GIFT",
      buyerId: user.id,
      itemId: token.itemId,
      quantity: input.amount,
      currency: "XLM",
      unitPrice: quote.total,
      platformFee: "0",
      total: quote.total,
      method: "WALLET",
      quoteExpiresAt: new Date(quote.expiresAt),
      breakdown: { ...quote, giftDetails: gift },
    },
  });
  ctx.activity.set({
    targetType: "Order",
    targetId: order.id,
    amount: quote.total,
    currency: "XLM",
  });

  const built = buildIssueTokens({
    sender: new Account(account.accountId(), account.sequenceNumber()),
    network: ctx.chain.config.network,
    issuer: token.issuerAccount.publicKey,
    to: recipient.walletAddress,
    asset: new Asset(token.code, token.issuer),
    amount: toAmount(toStroops(String(input.amount))),
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

/** Sends the gift: the artist's signature (their wallet, or the server's after the countdown), then the issuer's. */
export async function submitGift(
  ctx: ServiceCtx,
  user: SessionUser,
  input: { orderId: string; xdr: string },
) {
  const { chain, db } = ctx;
  const order = await ownOrder(ctx, user, input.orderId);
  if (order.kind !== "GIFT")
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
  const gift = (order.breakdown as { giftDetails?: GiftBreakdown } | null)?.giftDetails;
  if (!gift) throw new AppError(ErrorCodes.INTERNAL, { message: "This order has no gift." });

  // The issuer account is looked up from the token, never taken from the request.
  const token = await db.classicToken.findUnique({
    where: { itemId: gift.itemId },
    select: { issuerAccount: { select: { publicKey: true } } },
  });
  if (!token?.issuerAccount)
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Order not found" });

  let xdr = await userSignature(ctx, user, order.txHash, input.xdr);
  xdr = await chain.signWithServerKeys(xdr, [token.issuerAccount.publicKey]);

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

  await db.$transaction(async (tx) => {
    await transitionOrder(tx, order.id, "CONFIRMED");
    await tx.ownership.upsert({
      where: { userId_itemId: { userId: gift.recipientId, itemId: gift.itemId } },
      create: {
        userId: gift.recipientId,
        itemId: gift.itemId,
        quantity: gift.amount,
        source: "GIFT",
      },
      update: { quantity: { increment: gift.amount } },
    });
    await transitionOrder(tx, order.id, "DELIVERED");
  });
  return { orderId: order.id, status: "DELIVERED" as const };
}

/** Gifts the artist has sent, newest first. */
export async function listSentGifts(ctx: Pick<ServiceCtx, "db">, user: Pick<SessionUser, "id">) {
  const orders = await ctx.db.order.findMany({
    where: { kind: "GIFT", buyerId: user.id, status: "DELIVERED" },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, createdAt: true, txHash: true, breakdown: true },
  });
  const details = orders
    .map((order) => ({
      order,
      gift: (order.breakdown as { giftDetails?: GiftBreakdown } | null)?.giftDetails,
    }))
    .filter((entry): entry is { order: (typeof orders)[number]; gift: GiftBreakdown } =>
      Boolean(entry.gift),
    );
  const people = await ctx.db.user.findMany({
    where: { id: { in: [...new Set(details.map((entry) => entry.gift.recipientId))] } },
    select: { id: true, username: true, displayName: true, avatarUrl: true },
  });
  const byId = new Map(people.map((person) => [person.id, person]));
  return details.map(({ order, gift }) => {
    const person = byId.get(gift.recipientId);
    return {
      id: order.id,
      createdAt: order.createdAt,
      txHash: order.txHash,
      amount: gift.amount,
      code: gift.code,
      recipient: {
        id: gift.recipientId,
        name: person ? nameOf(person) : null,
        image: person?.avatarUrl ?? null,
      },
    };
  });
}

/** Followers to pick from, optionally narrowed by what's typed. Only fans with a wallet can receive. */
export async function listFollowers(
  ctx: Pick<ServiceCtx, "db">,
  artist: Pick<ArtistRef, "id">,
  search?: string,
) {
  const q = search?.trim();
  const rows = await ctx.db.follow.findMany({
    where: {
      artistId: artist.id,
      user: {
        walletAddress: { not: null },
        ...(q
          ? {
              OR: [
                { username: { contains: q, mode: "insensitive" } },
                { displayName: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
    },
    orderBy: { createdAt: "desc" },
    take: MAX_FOLLOWERS_SHOWN,
    select: {
      user: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
          walletAddress: true,
        },
      },
    },
  });
  return rows.flatMap(({ user }) =>
    user.walletAddress
      ? [
          {
            id: user.id,
            name: nameOf(user),
            username: user.username,
            wallet: user.walletAddress,
            image: user.avatarUrl,
          },
        ]
      : [],
  );
}
