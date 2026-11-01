import { Account, type Transaction, TransactionBuilder } from "@stellar/stellar-sdk";

import {
  buildNftTransfer,
  type RechargeProblem,
  toAmount,
  toDisplay,
  toStroops,
} from "@bandcoin/chain";
import { QUOTE_TTL_SECONDS } from "@bandcoin/chain/quote";
import { fundsOf } from "@bandcoin/chain/server";
import { AppError, ErrorCodes, isAppError } from "@bandcoin/errors";

import { type Context, isCustodial, type SessionUser } from "../../context";
import { transitionOrder } from "../order-state";
import { finishNftGift, type NftGiftDetails } from "../orders/finish";
import { failOrder, ownOrder, userSignature } from "../purchase";
import { findRecipient } from "./gifts";

/**
 * Collectible gifts, as on the old Bandcoin: an artist gives one copy of a
 * contract NFT they own to someone, by username, email or wallet. An email
 * with no account yet gets one, made when the artist presses Send.
 *
 * The artist's wallet is the transaction's source: they sign the contract's
 * `transfer` and pay its network fee in XLM, at most the amount shown. A
 * listed copy has to come off sale first (its listing would go stale). The
 * copy's unlocks and door codes stay with it; its unlock pins move to the
 * recipient when the gift lands (finishNftGift).
 */
type ServiceCtx = Pick<Context, "db" | "chain" | "activity">;

/** The most the network fee may be; the simulated fee must fit, or nothing is sent. */
export const NFT_GIFT_FEE_XLM = "0.05";

const unavailable = (message: string): RechargeProblem => ({ code: "UNAVAILABLE", message });
const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

type GiftInput = { editionId: string; recipient: string };

/** Contract NFT copies the user owns, grouped by NFT, with each copy's unlock progress. */
export async function giftableCopies(ctx: Pick<ServiceCtx, "db">, user: Pick<SessionUser, "id">) {
  const editions = await ctx.db.nftEdition.findMany({
    where: { ownerId: user.id, item: { chainType: "CONTRACT_NFT", deletedAt: null } },
    orderBy: [{ itemId: "asc" }, { tokenId: "asc" }],
    select: {
      id: true,
      tokenId: true,
      item: { select: { id: true, title: true, coverUrl: true, slug: true } },
      listing: { select: { status: true } },
      unlockPins: {
        select: {
          spots: { where: { isHidden: false }, select: { _count: { select: { claims: true } } } },
        },
      },
    },
  });
  const groups = new Map<
    string,
    {
      itemId: string;
      title: string;
      coverUrl: string;
      slug: string;
      copies: {
        editionId: string;
        tokenId: string;
        listed: boolean;
        unlocked: number;
        locked: number;
      }[];
    }
  >();
  for (const edition of editions) {
    const group = groups.get(edition.item.id) ?? {
      itemId: edition.item.id,
      title: edition.item.title,
      coverUrl: edition.item.coverUrl,
      slug: edition.item.slug,
      copies: [],
    };
    const unlocked = edition.unlockPins.filter(
      (pin) => pin.spots.length > 0 && pin.spots.every((spot) => spot._count.claims > 0),
    ).length;
    group.copies.push({
      editionId: edition.id,
      tokenId: edition.tokenId,
      listed: edition.listing?.status === "ACTIVE",
      unlocked,
      locked: edition.unlockPins.length - unlocked,
    });
    groups.set(edition.item.id, group);
  }
  return [...groups.values()];
}

async function prepare(ctx: ServiceCtx, user: SessionUser, input: GiftInput) {
  const { chain, db } = ctx;
  const problems: RechargeProblem[] = [];

  const edition = await db.nftEdition.findUnique({
    where: { id: input.editionId },
    select: {
      id: true,
      tokenId: true,
      ownerId: true,
      itemId: true,
      item: { select: { title: true, chainType: true, deletedAt: true } },
      listing: { select: { status: true } },
    },
  });
  if (!edition || edition.ownerId !== user.id || edition.item.chainType !== "CONTRACT_NFT")
    problems.push(unavailable("Pick a copy you own."));
  else if (edition.listing?.status === "ACTIVE")
    problems.push(unavailable("Take this copy off sale before gifting it."));
  if (!chain.config.nftContract)
    problems.push(unavailable("Contract NFTs aren't set up on this server yet."));

  const typed = input.recipient.trim();
  const recipient = typed ? await findRecipient(ctx, typed) : null;
  // An email nobody uses yet gets its account when the artist sends.
  const newEmail = !recipient && isEmail(typed) ? typed.toLowerCase() : null;
  if (!typed) problems.push(unavailable("Choose who to send it to."));
  else if (!recipient && !newEmail)
    problems.push(
      unavailable("We couldn't find a Bandcoin fan with that username or wallet. Try their email."),
    );
  else if (recipient?.id === user.id) problems.push(unavailable("You already own this copy."));

  const account = await chain.loadAccount(user.walletAddress);
  if (!account)
    problems.push(
      unavailable("Your wallet needs its first XLM before it can pay the network fee."),
    );

  const fee = toStroops(NFT_GIFT_FEE_XLM);
  const xlm = fundsOf(account, chain.config.assets).XLM;
  if (problems.length === 0 && xlm !== null && toStroops(xlm) < fee) {
    const have = toStroops(xlm);
    problems.push({
      code: "INSUFFICIENT_FUNDS",
      message: `You need ${toDisplay(fee - have)} more XLM to send this.`,
      shortfall: {
        currency: "XLM",
        need: toDisplay(fee),
        have: toDisplay(have),
        short: toDisplay(fee - have),
      },
    });
  }
  return { edition, recipient, newEmail, account, fee, problems };
}

function priceOf(prepared: Awaited<ReturnType<typeof prepare>>) {
  const { edition, recipient, newEmail, fee, problems } = prepared;
  return {
    ok: problems.length === 0,
    problems,
    total: toAmount(fee),
    lines: [
      { key: "networkFee", label: "Network fee, at most", currency: "XLM", amount: toDisplay(fee) },
      { key: "total", label: "You pay, at most", currency: "XLM", amount: toDisplay(fee) },
    ],
    gift: {
      title: edition?.item.title ?? null,
      tokenId: edition?.tokenId ?? null,
      recipient: recipient
        ? { id: recipient.id, name: recipient.name, image: recipient.image }
        : null,
      /** No account uses this email yet: one is made for it when you send */
      newAccountEmail: newEmail,
    },
    expiresAt: new Date(Date.now() + QUOTE_TTL_SECONDS * 1000).toISOString(),
  };
}

export async function quoteCollectibleGift(ctx: ServiceCtx, user: SessionUser, input: GiftInput) {
  return priceOf(await prepare(ctx, user, input));
}

/**
 * Makes the recipient's account if it's a new email, then the order and the
 * transfer for the artist to sign. Nothing is signed or sent yet.
 */
export async function startCollectibleGift(ctx: ServiceCtx, user: SessionUser, input: GiftInput) {
  const { chain, db } = ctx;
  const prepared = await prepare(ctx, user, input);
  const quote = priceOf(prepared);
  const { edition, account } = prepared;
  if (!quote.ok || !edition || !account)
    throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, {
      message: quote.problems[0]?.message ?? "This can't go through right now.",
      details: { problems: quote.problems },
    });

  let recipient: { id: string; walletAddress: string; newAccount: boolean };
  if (prepared.recipient) {
    recipient = { ...prepared.recipient, newAccount: false };
  } else {
    const made = await chain.accountForEmail(prepared.newEmail!);
    if (made.userId === user.id)
      throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, {
        message: "You already own this copy.",
      });
    recipient = { id: made.userId, walletAddress: made.walletAddress, newAccount: made.created };
  }

  const nftGift: NftGiftDetails = {
    editionId: edition.id,
    tokenId: edition.tokenId,
    itemId: edition.itemId,
    senderId: user.id,
    recipientId: recipient.id,
    recipientWallet: recipient.walletAddress,
    newAccount: recipient.newAccount,
  };
  const order = await db.order.create({
    data: {
      kind: "NFT_GIFT",
      buyerId: user.id,
      itemId: edition.itemId,
      quantity: 1,
      currency: "XLM",
      unitPrice: quote.total,
      platformFee: "0",
      total: quote.total,
      method: "WALLET",
      quoteExpiresAt: new Date(quote.expiresAt),
      breakdown: { ...quote, nftGift },
    },
  });
  ctx.activity.set({
    targetType: "Order",
    targetId: order.id,
    amount: quote.total,
    currency: "XLM",
  });

  let preparedXdr: string;
  let hash: string;
  try {
    const built = buildNftTransfer({
      source: new Account(account.accountId(), account.sequenceNumber()),
      network: chain.config.network,
      contract: chain.config.nftContract!,
      to: recipient.walletAddress,
      tokenId: Number(edition.tokenId),
    });
    preparedXdr = await chain.prepareContractCall(built.xdr);
    const tx = TransactionBuilder.fromXDR(
      preparedXdr,
      chain.config.network.passphrase,
    ) as Transaction;
    if (BigInt(tx.fee) > prepared.fee)
      throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, {
        message:
          "The network fee is higher than shown right now. Nothing was sent; try again in a minute.",
      });
    hash = Buffer.from(tx.hash()).toString("hex");
  } catch (error) {
    await transitionOrder(db, order.id, "FAILED", {
      failureCode: isAppError(error) ? error.code : ErrorCodes.STELLAR_TX_BUILD_FAILED,
    });
    throw error;
  }
  // The hash doesn't change when signatures are added, so it pins the exact transaction.
  await transitionOrder(db, order.id, "AWAITING_SIGNATURE", { txHash: hash });
  return {
    orderId: order.id,
    quote,
    xdr: preparedXdr,
    signer: isCustodial(user) ? ("custodial" as const) : ("wallet" as const),
  };
}

/** Sends it: the artist's signature (their wallet, or the server's after the countdown). */
export async function submitCollectibleGift(
  ctx: ServiceCtx,
  user: SessionUser,
  input: { orderId: string; xdr: string },
) {
  const { chain, db } = ctx;
  const order = await ownOrder(ctx, user, input.orderId);
  if (order.kind !== "NFT_GIFT")
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
  return finishNftGift(ctx, order.id);
}
