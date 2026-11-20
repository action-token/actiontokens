import { finishCancel, finishList } from "../resale/classic";
import { type Transaction, TransactionBuilder } from "@stellar/stellar-sdk";

import type { Order } from "@actiontokens/db";
import { AppError, ErrorCodes, isAppError } from "@actiontokens/errors";

import type { Context } from "../../context";
import { deliverVanity } from "../artist/vanity";
import { moveUnlockPins } from "../catalog/unlock-pins";
import { notifyNftGift } from "../email/gift-email";
import { transitionOrder } from "../order-state";
import { deliverOrder } from "../purchase";
import { finishNftPurchase } from "../purchase/nft";

/**
 * What happens once Stellar has accepted an order's transaction, one function
 * per kind. The app calls these right after submitting; the worker calls them
 * for orders whose answer from Stellar was lost (see reconcile.ts).
 *
 * Each runs in one database transaction that first moves the order
 * SUBMITTED → CONFIRMED. That move only succeeds once, so finishing twice
 * (the worker and the browser at the same moment) does nothing the second
 * time: it throws RESOURCE_CONFLICT and its changes roll back.
 */
type FinishCtx = Pick<Context, "db" | "chain" | "activity">;

export type FinishResult = { orderId: string; status: "DELIVERED" | "SUBMITTED" };

/** Only CONFIRMED → DELIVERED, for orders whose transaction is the whole delivery (stock, withdraw). */
export async function finishPlain(
  ctx: Pick<Context, "db">,
  orderId: string,
): Promise<FinishResult> {
  await ctx.db.$transaction(async (tx) => {
    await transitionOrder(tx, orderId, "CONFIRMED");
    await transitionOrder(tx, orderId, "DELIVERED");
  });
  return { orderId, status: "DELIVERED" };
}

export type GiftDetails = {
  recipientId: string;
  itemId: string;
  amount: number;
  /** Held as a claimable balance: the fan owns it once they claim it */
  claimable?: boolean;
};

/** A gift: the recipient now owns it. */
export async function finishGift(ctx: Pick<Context, "db">, orderId: string): Promise<FinishResult> {
  await ctx.db.$transaction(async (tx) => {
    await transitionOrder(tx, orderId, "CONFIRMED");
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { breakdown: true },
    });
    const gift = (order.breakdown as { giftDetails?: GiftDetails } | null)?.giftDetails;
    if (!gift) throw new AppError(ErrorCodes.INTERNAL, { message: "This order has no gift." });
    if (!gift.claimable)
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
    await transitionOrder(tx, orderId, "DELIVERED");
  });
  return { orderId, status: "DELIVERED" };
}

export type NftGiftDetails = {
  editionId: string;
  tokenId: string;
  itemId: string;
  senderId: string;
  recipientId: string;
  recipientWallet: string;
  /** The recipient's account was made for this gift (from their email) */
  newAccount: boolean;
};

/**
 * An NFT copy given: the recipient owns it now, with its unlock pins (the
 * places only its owner can collect). Door codes and unlocks belong to the
 * copy, so they need nothing.
 */
export async function finishNftGift(
  ctx: Pick<Context, "db" | "chain">,
  orderId: string,
): Promise<FinishResult> {
  const gift = await ctx.db.$transaction(async (tx) => {
    await transitionOrder(tx, orderId, "CONFIRMED");
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { breakdown: true },
    });
    const gift = (order.breakdown as { nftGift?: NftGiftDetails } | null)?.nftGift;
    if (!gift) throw new AppError(ErrorCodes.INTERNAL, { message: "This order has no gift." });
    await tx.nftEdition.update({
      where: { id: gift.editionId },
      data: { ownerId: gift.recipientId },
    });
    const sender = await tx.ownership.findUnique({
      where: { userId_itemId: { userId: gift.senderId, itemId: gift.itemId } },
      select: { quantity: true },
    });
    if (sender && sender.quantity.lte(1))
      await tx.ownership.delete({
        where: { userId_itemId: { userId: gift.senderId, itemId: gift.itemId } },
      });
    else if (sender)
      await tx.ownership.update({
        where: { userId_itemId: { userId: gift.senderId, itemId: gift.itemId } },
        data: { quantity: { decrement: 1 } },
      });
    await tx.ownership.upsert({
      where: { userId_itemId: { userId: gift.recipientId, itemId: gift.itemId } },
      create: { userId: gift.recipientId, itemId: gift.itemId, quantity: 1, source: "GIFT" },
      update: { quantity: { increment: 1 } },
    });
    await moveUnlockPins(tx, gift.editionId, gift.recipientId);
    await transitionOrder(tx, orderId, "DELIVERED");
    return gift;
  });
  // Once only (the CONFIRMED move above guards it), whether the app or the worker finished it.
  await notifyNftGift(ctx, gift);
  return { orderId, status: "DELIVERED" };
}

/**
 * An artist account opened (issuer or storage): the account the transaction
 * created is marked open and linked to the artist who paid for it.
 */
export async function finishAccountOpening(
  ctx: Pick<Context, "db" | "chain">,
  orderId: string,
  envelopeXdr: string,
  kind: "ISSUER" | "STORAGE",
): Promise<FinishResult> {
  const tx = TransactionBuilder.fromXDR(
    envelopeXdr,
    ctx.chain.config.network.passphrase,
  ) as Transaction;
  const created = tx.operations[0];
  const key = created?.type === "createAccount" ? created.destination : null;
  await ctx.db.$transaction(async (db) => {
    await transitionOrder(db, orderId, "CONFIRMED");
    const order = await db.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { buyerId: true },
    });
    const account = key ? await db.chainAccount.findUnique({ where: { publicKey: key } }) : null;
    if (!account || account.kind !== kind || account.ownerId !== order.buyerId || !order.buyerId)
      throw new AppError(ErrorCodes.INTERNAL, { message: "This order's account doesn't match." });
    await db.chainAccount.update({ where: { id: account.id }, data: { activatedAt: new Date() } });
    await db.artist.update({
      where: { userId: order.buyerId },
      data: kind === "ISSUER" ? { issuerAccountId: account.id } : { storageAccountId: account.id },
    });
    await transitionOrder(db, orderId, "DELIVERED");
  });
  return { orderId, status: "DELIVERED" };
}

/**
 * A contract NFT registered: record the edition id the contract gave. The
 * contract's answer can lag the payment, so an unanswered read leaves the
 * order SUBMITTED for the next try.
 */
export async function finishNftRegistration(
  ctx: Pick<Context, "db" | "chain">,
  orderId: string,
): Promise<FinishResult> {
  const order = await ctx.db.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { breakdown: true },
  });
  const itemId = (order.breakdown as { itemId?: string } | null)?.itemId;
  if (!itemId) throw new AppError(ErrorCodes.INTERNAL, { message: "This order has no item." });
  const editionId = await ctx.chain.editionIdByRef(itemId).catch(() => null);
  if (editionId === null) return { orderId, status: "SUBMITTED" };
  await ctx.db.$transaction(async (tx) => {
    await transitionOrder(tx, orderId, "CONFIRMED");
    await tx.contractNft.update({
      where: { itemId },
      data: { onChainEditionId: String(editionId), status: "MINTED" },
    });
    await transitionOrder(tx, orderId, "DELIVERED");
  });
  return { orderId, status: "DELIVERED" };
}

/** Finishes any order kind whose transaction Stellar accepted (`envelopeXdr` is what landed). */
export async function finishOrder(
  ctx: FinishCtx,
  order: Pick<Order, "id" | "kind">,
  envelopeXdr: string,
): Promise<FinishResult> {
  switch (order.kind) {
    case "ITEM_PURCHASE":
    case "RECHARGE":
    case "XLM_SWAP":
    case "BANDCOIN_SWAP":
    case "TOKEN_TRUST":
    case "ACTIVATION":
      return deliverOrder(ctx, order.id);
    case "GIFT":
      return finishGift(ctx, order.id);
    case "VANITY":
      return { orderId: order.id, status: (await deliverVanity(ctx, order.id)).status };
    case "RESALE_LIST":
      return finishList(ctx, order.id);
    case "RESALE_CANCEL":
      return finishCancel(ctx, order.id);
    case "SEND":
    case "STORAGE_STOCK":
    case "STORAGE_WITHDRAW":
    case "STORAGE_DEPOSIT":
    case "NFT_PLATFORM_FEE":
      return finishPlain(ctx, order.id);
    case "ISSUER_SETUP":
      return finishAccountOpening(ctx, order.id, envelopeXdr, "ISSUER");
    case "STORAGE_SETUP":
      return finishAccountOpening(ctx, order.id, envelopeXdr, "STORAGE");
    case "NFT_REGISTER":
      return finishNftRegistration(ctx, order.id);
    case "NFT_PURCHASE":
      return finishNftPurchase(ctx, order.id);
    case "NFT_GIFT":
      return finishNftGift(ctx, order.id);
  }
}

/** True when finishing failed only because it was already finished (the other side won the race). */
export const alreadyFinished = (error: unknown) =>
  isAppError(error) && error.code === ErrorCodes.RESOURCE_CONFLICT;
