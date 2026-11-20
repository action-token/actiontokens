import { Account, Asset } from "@stellar/stellar-sdk";
import type { Horizon } from "@stellar/stellar-sdk";

import {
  buildIssueTokens,
  buildStorageGift,
  CLAIMABLE_RESERVE_XLM,
  networkFeeXlm,
  type RechargeProblem,
  toAmount,
  toDisplay,
  toStroops,
} from "@actiontokens/chain";
import { QUOTE_TTL_SECONDS } from "@actiontokens/chain/quote";
import { fundsOf } from "@actiontokens/chain/server";
import { AppError, ErrorCodes, isAppError } from "@actiontokens/errors";

import { type Context, type SessionUser, isCustodial } from "../../context";
import { transitionOrder } from "../order-state";
import { finishGift, type NftGiftDetails } from "../orders/finish";
import { declinedAmong } from "../gifts/decline";
import { failOrder, ownOrder, userSignature } from "../purchase";
import { waitingGifts } from "./gift-take-back";
import { creditLines, freeOf, openedStorage } from "./storage-withdraw";

/**
 * Gifts: an artist gives some of their fan token to one of their followers,
 * for example to lift them into a membership tier, as on the old Bandcoin.
 *
 *   from storage   the tokens come out of the artist's storage account (the
 *                  supply issued at approval), so nothing new is made. A fan
 *                  without a trustline gets a claimable balance they accept
 *                  in the fan app; the artist pays the 1 XLM it locks.
 *   no storage     the old way: new tokens are issued to a fan who already
 *                  trusts the token.
 *
 * The artist's wallet is the transaction's source and pays the network fee;
 * the platform co-signs for storage (or the issuer). Collectibles and email
 * invites come later.
 */
type ServiceCtx = Pick<Context, "db" | "chain" | "activity">;
type ArtistRef = { id: string; fanTokenItemId: string | null; storageAccountId: string | null };

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
  /** Where the tokens come from */
  from?: "STORAGE" | "ISSUER";
  /** The fan claims it later (they didn't trust the token yet) */
  claimable?: boolean;
  /** Nobody accepted it and the artist took it back (see ./gift-take-back) */
  takenBack?: { txHash: string; at: string };
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
  const storage = await openedStorage(ctx, artist);
  if (!token)
    problems.push(unavailable("Create your fan token first (Memberships), then you can gift it."));
  else if (!storage && (token.isExternal || !token.issuerAccount))
    problems.push(
      unavailable(
        "Your token was issued elsewhere, so gifts come from your storage account. Open it under Settings › Accounts.",
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
  else if (
    !(await db.follow.findUnique({
      where: { userId_artistId: { userId: recipient.id, artistId: artist.id } },
      select: { userId: true },
    }))
  )
    problems.push(
      unavailable(
        `${recipient.name ?? "This fan"} doesn't follow you. Gifts go to your followers.`,
      ),
    );

  const account = await chain.loadAccount(user.walletAddress);
  if (!account)
    problems.push(
      unavailable("Your wallet needs its first XLM before it can pay the network fee."),
    );

  let claimable = false;
  if (token && recipient && problems.length === 0) {
    const theirs = await chain.loadAccount(recipient.walletAddress);
    const trusts = Boolean(theirs && holdsTrustline(theirs, token.code, token.issuer));
    if (storage) {
      claimable = !trusts;
      const held = await chain.loadAccount(storage.publicKey);
      const line = creditLines(held).find(
        (entry) => entry.asset_code === token.code && entry.asset_issuer === token.issuer,
      );
      const have = line ? freeOf(line) : 0n;
      if (have < toStroops(String(input.amount)))
        problems.push(
          unavailable(
            `Your storage has ${toDisplay(have)} ${token.code}. Move more in under Settings › Balances, or gift less.`,
          ),
        );
    } else if (!trusts) {
      problems.push(
        unavailable(
          `${recipient.name ?? "This fan"} hasn't added your token to their wallet yet. Open your storage account (Settings › Accounts) to send it as a gift they can claim.`,
        ),
      );
    }
  }

  const fee = toStroops(networkFeeXlm(claimable ? 2 : 1, chain.config.network.baseFee));
  const reserve = claimable ? toStroops(CLAIMABLE_RESERVE_XLM) : 0n;
  const xlm = fundsOf(account, chain.config.assets).XLM;
  if (problems.length === 0 && xlm !== null) {
    const have = toStroops(xlm);
    if (have < fee + reserve) {
      problems.push({
        code: "INSUFFICIENT_FUNDS",
        message: `You need ${toDisplay(fee + reserve - have)} more XLM to send this.`,
        shortfall: {
          currency: "XLM",
          need: toDisplay(fee + reserve),
          have: toDisplay(have),
          short: toDisplay(fee + reserve - have),
        },
      });
    }
  }
  return { token, recipient, account, storage, claimable, fee, reserve, problems };
}

function priceOf(prepared: Awaited<ReturnType<typeof prepare>>, input: { amount: number }) {
  const { token, recipient, storage, claimable, fee, reserve, problems } = prepared;
  return {
    ok: problems.length === 0,
    problems,
    total: toAmount(fee + reserve),
    lines: [
      ...(claimable
        ? [
            {
              key: "reserve",
              label: "Holds the gift until they claim it",
              currency: "XLM",
              amount: toDisplay(reserve),
            },
          ]
        : []),
      { key: "networkFee", label: "Network fee", currency: "XLM", amount: toDisplay(fee) },
      { key: "total", label: "You pay", currency: "XLM", amount: toDisplay(fee + reserve) },
    ],
    /** What is being given, shown next to the price: it comes from storage (or is newly issued) */
    gift: {
      amount: input.amount,
      from: storage ? ("STORAGE" as const) : ("ISSUER" as const),
      claimable,
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
  const { token, recipient, account, storage, claimable } = prepared;
  if (!quote.ok || !token || (!storage && !token.issuerAccount) || !recipient || !account) {
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
    from: storage ? "STORAGE" : "ISSUER",
    claimable,
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

  const sender = new Account(account.accountId(), account.sequenceNumber());
  const asset = new Asset(token.code, token.issuer);
  const amount = toAmount(toStroops(String(input.amount)));
  const { network } = ctx.chain.config;
  const built = storage
    ? buildStorageGift({
        sender,
        network,
        storage: storage.publicKey,
        to: recipient.walletAddress,
        asset,
        amount,
        claimable,
        memo: order.id,
      })
    : buildIssueTokens({
        sender,
        network,
        issuer: (token.issuerAccount as { publicKey: string }).publicKey,
        to: recipient.walletAddress,
        asset,
        amount,
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

/** Sends the gift: the artist's signature (their wallet, or the server's after the countdown), then storage's or the issuer's. */
export async function submitGift(
  ctx: ServiceCtx,
  user: SessionUser,
  artist: Pick<ArtistRef, "storageAccountId">,
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

  // The co-signing account is looked up here, never taken from the request; the hash pins the payment.
  const signer =
    gift.from === "STORAGE"
      ? (await openedStorage(ctx, artist))?.publicKey
      : (
          await db.classicToken.findUnique({
            where: { itemId: gift.itemId },
            select: { issuerAccount: { select: { publicKey: true } } },
          })
        )?.issuerAccount?.publicKey;
  if (!signer) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Order not found" });

  let xdr = await userSignature(ctx, user, order.txHash, input.xdr);
  xdr = await chain.signWithServerKeys(xdr, [signer]);

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

  return finishGift(ctx, order.id);
}

/**
 * Gifts the artist has sent (tokens and NFT copies), newest first. A token
 * gift the fan hasn't accepted yet is "waiting" (it can be taken back).
 */
export async function listSentGifts(
  ctx: Pick<ServiceCtx, "db" | "chain">,
  user: Pick<SessionUser, "id">,
  artist: Pick<ArtistRef, "storageAccountId">,
) {
  const waiting = await waitingGifts(ctx, user, artist);
  const declined = await declinedAmong(ctx, [...waiting.values()]);
  const orders = await ctx.db.order.findMany({
    where: { kind: { in: ["GIFT", "NFT_GIFT"] }, buyerId: user.id, status: "DELIVERED" },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      createdAt: true,
      txHash: true,
      breakdown: true,
      item: { select: { title: true } },
    },
  });
  const details = orders.flatMap((order) => {
    const breakdown = order.breakdown as {
      giftDetails?: GiftBreakdown;
      nftGift?: NftGiftDetails;
    } | null;
    const recipientId = breakdown?.giftDetails?.recipientId ?? breakdown?.nftGift?.recipientId;
    if (!recipientId) return [];
    return [
      {
        order,
        recipientId,
        tokens: breakdown?.giftDetails
          ? { amount: breakdown.giftDetails.amount, code: breakdown.giftDetails.code }
          : null,
        state: breakdown?.giftDetails?.takenBack
          ? ("takenBack" as const)
          : waiting.has(order.id)
            ? ("waiting" as const)
            : null,
        declined: declined.has(waiting.get(order.id) ?? ""),
        copy: breakdown?.nftGift
          ? { title: order.item?.title ?? "NFT", tokenId: breakdown.nftGift.tokenId }
          : null,
      },
    ];
  });
  const people = await ctx.db.user.findMany({
    where: { id: { in: [...new Set(details.map((entry) => entry.recipientId))] } },
    select: { id: true, username: true, displayName: true, avatarUrl: true },
  });
  const byId = new Map(people.map((person) => [person.id, person]));
  return details.map(({ order, recipientId, tokens, copy, state, declined: wasDeclined }) => {
    const person = byId.get(recipientId);
    return {
      id: order.id,
      createdAt: order.createdAt,
      txHash: order.txHash,
      /** A token gift: how many of which token */
      tokens,
      /** An NFT gift: which copy */
      copy,
      /** "waiting": not accepted yet, can be taken back. "takenBack": the artist took it back. */
      state,
      /** A waiting gift the fan said no to */
      declined: wasDeclined,
      recipient: {
        id: recipientId,
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
