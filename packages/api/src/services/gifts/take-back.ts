import { toStroops } from "@actiontokens/chain";
import { AppError, ErrorCodes } from "@actiontokens/errors";

import type { SessionUser } from "../../context";
import { costOf, holds, prepareClaim, sendClaim, sentBy, type ServiceCtx } from "./claim";
import { declinedAmong, forgetDeclined } from "./decline";

/**
 * Take-back: a token the user sent to someone who couldn't hold it yet waits
 * as a claimable balance that both of them can claim. Until the receiver
 * accepts, the sender can claim it back into their own wallet. They pay the
 * network fee (and the trustline reserve, if they closed the line since); the
 * 1 XLM the balance held is theirs again.
 *
 *   list    → what's still waiting, with who it's for and what taking back costs
 *   prepare → the transaction to sign (custodial accounts get the countdown)
 *   submit  → checks it's exactly that claim, signs for custodial, sends it,
 *             and marks the send in the sender's history
 *
 * No ownership rows change: sending didn't change any.
 */
type SendDetails = {
  to: string;
  code: string;
  issuer: string | null;
  amount: string;
  mode: string;
  takenBack?: { txHash: string; at: string };
};

/** Sends still waiting to be accepted, as the network lists them. */
export async function listSentWaiting(ctx: ServiceCtx, user: Pick<SessionUser, "walletAddress">) {
  const mine = user.walletAddress;
  if (!mine) return [];
  const [claimable, account] = await Promise.all([
    ctx.chain.claimableFor(mine),
    ctx.chain.loadAccount(mine),
  ]);
  const waiting = claimable.filter((gift) => sentBy(gift, mine));
  if (waiting.length === 0) return [];
  const receiverOf = (gift: (typeof waiting)[number]) =>
    gift.claimants.find((address) => address !== mine) ?? null;
  const receivers = [...new Set(waiting.flatMap((gift) => receiverOf(gift) ?? []))];
  const [people, declined] = await Promise.all([
    ctx.db.user.findMany({
      where: { walletAddress: { in: receivers } },
      select: { walletAddress: true, username: true, displayName: true },
    }),
    declinedAmong(
      ctx,
      waiting.map((gift) => gift.id),
    ),
  ]);
  return waiting.map((gift) => {
    const address = receiverOf(gift);
    const person = people.find((row) => row.walletAddress === address);
    return {
      balanceId: gift.id,
      code: gift.code,
      amount: gift.amount,
      /** Who it's waiting for, named when they're on Action Tokens */
      to: { address, username: person?.username ?? null, name: person?.displayName ?? null },
      cost: costOf(ctx, !holds(account, gift.code, gift.issuer)),
      /** The person it's waiting for said no to it */
      declined: declined.has(gift.id),
    };
  });
}

/** The user's own waiting send, checked against the network: never trusted from the request. */
async function waitingSend(ctx: ServiceCtx, user: SessionUser, balanceId: string) {
  const gift = (await ctx.chain.claimableFor(user.walletAddress)).find(
    (entry) => entry.id === balanceId && sentBy(entry, user.walletAddress),
  );
  if (!gift)
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, {
      message: "This isn't waiting any more. It was accepted or already taken back.",
    });
  return gift;
}

export async function prepareTakeBack(ctx: ServiceCtx, user: SessionUser, balanceId: string) {
  return prepareClaim(ctx, user, await waitingSend(ctx, user, balanceId), "take this back");
}

export async function submitTakeBack(
  ctx: ServiceCtx,
  user: SessionUser,
  input: { balanceId: string; xdr: string },
) {
  const gift = await waitingSend(ctx, user, input.balanceId);
  const hash = await sendClaim(ctx, user, gift, input.xdr);
  ctx.activity.set({ targetType: "ClaimableBalance", targetId: gift.id, txHash: hash });
  await forgetDeclined(ctx, gift.id);

  // The send it came from says so in the history. Identical sends are interchangeable: newest first.
  const receiver = gift.claimants.find((address) => address !== user.walletAddress);
  const sends = await ctx.db.order.findMany({
    where: { kind: "SEND", buyerId: user.id, status: "DELIVERED" },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, breakdown: true },
  });
  const match = sends.find((order) => {
    const send = (order.breakdown as { sendDetails?: SendDetails } | null)?.sendDetails;
    return (
      send?.mode === "gift" &&
      !send.takenBack &&
      send.to === receiver &&
      send.code === gift.code &&
      send.issuer === gift.issuer &&
      toStroops(send.amount) === toStroops(gift.amount)
    );
  });
  if (match) {
    const breakdown = match.breakdown as { sendDetails: SendDetails };
    await ctx.db.order.update({
      where: { id: match.id },
      data: {
        breakdown: {
          ...breakdown,
          sendDetails: {
            ...breakdown.sendDetails,
            takenBack: { txHash: hash, at: new Date().toISOString() },
          },
        },
      },
    });
  }
  return { txHash: hash, code: gift.code, amount: gift.amount };
}
