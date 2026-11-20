import { Account, type Transaction, TransactionBuilder } from "@stellar/stellar-sdk";

import {
  buildStorageTakeBack,
  CLAIMABLE_RESERVE_XLM,
  networkFeeXlm,
  toDisplay,
  toStroops,
} from "@actiontokens/chain";
import { spendableXlm } from "@actiontokens/chain/server";
import { AppError, ErrorCodes } from "@actiontokens/errors";

import { type Context, isCustodial, type SessionUser } from "../../context";
import { forgetDeclined } from "../gifts/decline";
import { ownOrder } from "../purchase";
import type { GiftBreakdown } from "./gifts";
import { openedStorage } from "./storage-withdraw";

/**
 * Take-back: a fan-token gift to a fan who couldn't hold it yet waits as a
 * claimable balance that the fan and the artist's storage account can both
 * claim. Until the fan accepts, the artist can take it back: storage claims
 * it (the tokens return to storage) and pays the artist's wallet the 1 XLM
 * the artist put in to hold it. The artist's wallet pays the network fee;
 * the platform co-signs for storage.
 *
 *   prepare → the transaction to sign (custodial accounts get the countdown)
 *   submit  → checks it's exactly that take-back before storage signs, sends
 *             it, and marks the gift order as taken back
 */
type ServiceCtx = Pick<Context, "db" | "chain" | "activity">;
type ArtistRef = { storageAccountId: string | null };
const TAKE_BACK_OPERATIONS = 2;
const MAX_GIFTS_CHECKED = 200;

const giftOf = (breakdown: unknown) =>
  (breakdown as { giftDetails?: GiftBreakdown } | null)?.giftDetails ?? null;

/**
 * Which of the artist's gifts are still waiting: gift order id → the balance
 * on the network. A gift is matched to storage's balances by token, amount and
 * receiver. Two identical waiting gifts are interchangeable, so they pair
 * newest first.
 */
export async function waitingGifts(
  ctx: Pick<ServiceCtx, "db" | "chain">,
  user: Pick<SessionUser, "id">,
  artist: ArtistRef,
): Promise<Map<string, string>> {
  const waiting = new Map<string, string>();
  const storage = await openedStorage(ctx, artist);
  if (!storage) return waiting;
  const left = (await ctx.chain.claimableFor(storage.publicKey)).filter(
    (balance) => balance.sponsor === storage.publicKey,
  );
  if (left.length === 0) return waiting;
  const orders = await ctx.db.order.findMany({
    where: { kind: "GIFT", buyerId: user.id, status: "DELIVERED" },
    orderBy: { createdAt: "desc" },
    take: MAX_GIFTS_CHECKED,
    select: { id: true, breakdown: true },
  });
  for (const order of orders) {
    const gift = giftOf(order.breakdown);
    if (!gift?.claimable || gift.takenBack) continue;
    const at = left.findIndex(
      (balance) =>
        balance.code === gift.code &&
        balance.issuer === gift.issuer &&
        toStroops(balance.amount) === toStroops(String(gift.amount)) &&
        balance.claimants.includes(gift.recipientWallet),
    );
    const [balance] = at >= 0 ? left.splice(at, 1) : [];
    if (balance) waiting.set(order.id, balance.id);
  }
  return waiting;
}

/** The artist's own gift order and the balance still waiting for it, checked against the network. */
async function waitingGift(ctx: ServiceCtx, user: SessionUser, artist: ArtistRef, orderId: string) {
  const order = await ownOrder(ctx, user, orderId);
  const gift =
    order.kind === "GIFT" && order.status === "DELIVERED" ? giftOf(order.breakdown) : null;
  if (!gift) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Gift not found" });
  ctx.activity.set({ targetType: "Order", targetId: order.id });
  if (gift.takenBack)
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, {
      message: "You already took this gift back.",
    });
  const storage = await openedStorage(ctx, artist);
  const balanceId = (await waitingGifts(ctx, user, artist)).get(order.id);
  if (!storage || !balanceId)
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, {
      message: "This gift isn't waiting any more. It was accepted.",
    });
  return { order, gift, balanceId, storage: storage.publicKey };
}

export async function prepareGiftTakeBack(
  ctx: ServiceCtx,
  user: SessionUser,
  artist: ArtistRef,
  orderId: string,
) {
  const { balanceId, storage } = await waitingGift(ctx, user, artist, orderId);
  const account = await ctx.chain.loadAccount(user.walletAddress);
  const fee = toStroops(networkFeeXlm(TAKE_BACK_OPERATIONS, ctx.chain.config.network.baseFee));
  const have = account ? toStroops(spendableXlm(account)) : 0n;
  if (!account || have < fee)
    throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, {
      message: `Your wallet needs ${toDisplay(fee - have)} more XLM for the network fee.`,
    });
  const built = buildStorageTakeBack({
    sender: new Account(account.accountId(), account.sequenceNumber()),
    network: ctx.chain.config.network,
    storage,
    balanceId,
  });
  return {
    xdr: built.xdr,
    signer: isCustodial(user) ? ("custodial" as const) : ("wallet" as const),
  };
}

/**
 * Storage signs only this: from the artist's wallet, storage claims that
 * balance, then pays the artist's wallet the XLM the balance held. Nothing else.
 */
function assertIsTakeBack(
  xdr: string,
  passphrase: string,
  expected: { wallet: string; storage: string; balanceId: string },
) {
  let tx: Transaction;
  try {
    tx = TransactionBuilder.fromXDR(xdr, passphrase) as Transaction;
  } catch {
    throw new AppError(ErrorCodes.STELLAR_TX_REJECTED, {
      message: "That isn't a valid transaction.",
    });
  }
  const [claim, refund] = tx.operations;
  const ok =
    tx.source === expected.wallet &&
    tx.operations.length === TAKE_BACK_OPERATIONS &&
    claim?.type === "claimClaimableBalance" &&
    claim.source === expected.storage &&
    claim.balanceId === expected.balanceId &&
    refund?.type === "payment" &&
    refund.source === expected.storage &&
    refund.destination === expected.wallet &&
    refund.asset.isNative() &&
    toStroops(refund.amount) === toStroops(CLAIMABLE_RESERVE_XLM);
  if (!ok)
    throw new AppError(ErrorCodes.STELLAR_TX_REJECTED, {
      message: "That transaction isn't the one we prepared.",
    });
}

export async function submitGiftTakeBack(
  ctx: ServiceCtx,
  user: SessionUser,
  artist: ArtistRef,
  input: { orderId: string; xdr: string },
) {
  const { order, gift, balanceId, storage } = await waitingGift(ctx, user, artist, input.orderId);
  assertIsTakeBack(input.xdr, ctx.chain.config.network.passphrase, {
    wallet: user.walletAddress,
    storage,
    balanceId,
  });
  let xdr = input.xdr;
  if (isCustodial(user)) {
    if (!user.email) throw new AppError(ErrorCodes.WALLET_NOT_CONNECTED);
    xdr = await ctx.chain.signForCustodialUser(xdr, user.email);
  }
  xdr = await ctx.chain.signWithServerKeys(xdr, [storage]);
  const { hash } = await ctx.chain.submit(xdr);
  ctx.activity.set({ txHash: hash });

  await forgetDeclined(ctx, balanceId);
  const takenBack = { txHash: hash, at: new Date().toISOString() };
  await ctx.db.order.update({
    where: { id: order.id },
    data: {
      breakdown: { ...(order.breakdown as object), giftDetails: { ...gift, takenBack } },
    },
  });
  return { txHash: hash, code: gift.code, amount: gift.amount };
}
