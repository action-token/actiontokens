import { AppError, ErrorCodes } from "@actiontokens/errors";

import type { Context, SessionUser } from "../../context";
import { sentBy, type ServiceCtx } from "./claim";

/**
 * Declining a gift. A receiver can't delete a gift waiting on the network, so
 * declining only records that they said no: their Pending gifts stops showing
 * it, and the sender sees "Declined" and can take it back (./take-back). The
 * fan can put it back, or accept it after all, for as long as it's waiting.
 *
 * Rows for gifts that are gone never show (every list starts from what's on
 * the network); accepting or taking back a gift clears its rows.
 */
type Db = Pick<Context, "db">;

export async function declineGift(ctx: ServiceCtx, user: SessionUser, balanceId: string) {
  const waiting = (await ctx.chain.claimableFor(user.walletAddress)).some(
    (gift) => gift.id === balanceId && !sentBy(gift, user.walletAddress),
  );
  if (!waiting)
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, {
      message: "This gift isn't waiting for you any more.",
    });
  ctx.activity.set({ targetType: "ClaimableBalance", targetId: balanceId });
  await ctx.db.declinedGift.upsert({
    where: { userId_balanceId: { userId: user.id, balanceId } },
    create: { userId: user.id, balanceId },
    update: {},
  });
  return { balanceId, declined: true };
}

/** Puts a declined gift back among the pending ones. */
export async function undoDecline(ctx: ServiceCtx, user: SessionUser, balanceId: string) {
  ctx.activity.set({ targetType: "ClaimableBalance", targetId: balanceId });
  await ctx.db.declinedGift.deleteMany({ where: { userId: user.id, balanceId } });
  return { balanceId, declined: false };
}

/** Which of these waiting gifts this fan declined. */
export async function declinedBy(ctx: Db, userId: string, balanceIds: string[]) {
  if (balanceIds.length === 0) return new Set<string>();
  const rows = await ctx.db.declinedGift.findMany({
    where: { userId, balanceId: { in: balanceIds } },
    select: { balanceId: true },
  });
  return new Set(rows.map((row) => row.balanceId));
}

/** For a sender: which of the gifts they sent were declined by the person they're waiting for. */
export async function declinedAmong(ctx: Db, balanceIds: string[]) {
  if (balanceIds.length === 0) return new Set<string>();
  const rows = await ctx.db.declinedGift.findMany({
    where: { balanceId: { in: balanceIds } },
    select: { balanceId: true },
  });
  return new Set(rows.map((row) => row.balanceId));
}

/** The gift is gone from the network (accepted or taken back): nothing left to remember. */
export const forgetDeclined = (ctx: Db, balanceId: string) =>
  ctx.db.declinedGift.deleteMany({ where: { balanceId } });
