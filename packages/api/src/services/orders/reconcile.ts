import type { Order } from "@bandcoin/db";
import { AppError, ErrorCodes } from "@bandcoin/errors";

import type { Context } from "../../context";
import { failOrder } from "../purchase";
import { alreadyFinished, finishOrder } from "./finish";

/**
 * The worker's `order.reconcile`: orders left SUBMITTED because Stellar's
 * answer never reached us. Each is looked up by its transaction hash:
 *
 *   landed, successful → finished exactly as the app would (finish.ts)
 *   landed, failed     → FAILED with the code; a card charge is refunded
 *   not found, too old → FAILED (past its time limit it can never land)
 *   not found yet      → left for the next run
 */
type ReconcileCtx = Pick<Context, "db" | "chain" | "activity">;

/** Leave an order alone this long after it was sent: the app may still be finishing it. */
export const SETTLE_AFTER_MS = 60_000;
/** After the transaction's time limit, wait this long more before calling it lost. */
export const LOST_AFTER_MS = 10 * 60_000;
/** Without a known time limit, an unseen transaction counts as lost after this long. */
export const FALLBACK_LOST_MS = 30 * 60_000;
/** Orders looked at per run, oldest first. */
export const RECONCILE_BATCH = 50;

export type Settlement = "DELIVERED" | "FAILED" | "WAITING";

/** One stuck order, settled from what Stellar says happened. */
export async function settleOrder(
  ctx: ReconcileCtx,
  order: Pick<
    Order,
    "id" | "kind" | "txHash" | "cardPaymentId" | "total" | "quoteExpiresAt" | "updatedAt"
  >,
  now = new Date(),
): Promise<Settlement> {
  const card = order.cardPaymentId
    ? { paymentId: order.cardPaymentId, total: order.total.toString() }
    : null;
  const found = order.txHash ? await ctx.chain.findTransaction(order.txHash) : null;

  if (found?.successful) {
    try {
      const finished = await finishOrder(ctx, order, found.envelopeXdr);
      return finished.status === "DELIVERED" ? "DELIVERED" : "WAITING";
    } catch (error) {
      // The app finished it between our read and now: nothing left to do.
      if (alreadyFinished(error)) return "DELIVERED";
      throw error;
    }
  }
  if (found) {
    await failOrder(ctx, order.id, new AppError(ErrorCodes.STELLAR_TX_REJECTED), card);
    return "FAILED";
  }

  // Not on the network. Past its time limit (the quote's expiry, which the
  // transaction's maxTime matches) it never will be.
  const lostAt = order.quoteExpiresAt
    ? order.quoteExpiresAt.getTime() + LOST_AFTER_MS
    : order.updatedAt.getTime() + FALLBACK_LOST_MS;
  if (now.getTime() < lostAt) return "WAITING";
  await failOrder(ctx, order.id, new AppError(ErrorCodes.STELLAR_TX_SUBMIT_FAILED), card);
  return "FAILED";
}

/** Settles every order stuck SUBMITTED for over a minute. One failing order doesn't stop the rest. */
export async function reconcileOrders(ctx: ReconcileCtx, now = new Date()) {
  const orders = await ctx.db.order.findMany({
    where: { status: "SUBMITTED", updatedAt: { lt: new Date(now.getTime() - SETTLE_AFTER_MS) } },
    orderBy: { updatedAt: "asc" },
    take: RECONCILE_BATCH,
    select: {
      id: true,
      kind: true,
      txHash: true,
      cardPaymentId: true,
      total: true,
      quoteExpiresAt: true,
      updatedAt: true,
      buyerId: true,
    },
  });
  const counts: Record<Settlement | "ERROR", number> = {
    DELIVERED: 0,
    FAILED: 0,
    WAITING: 0,
    ERROR: 0,
  };
  for (const order of orders) {
    let outcome: Settlement | "ERROR";
    let errorCode: string | null = null;
    try {
      outcome = await settleOrder(ctx, order, now);
    } catch (error) {
      outcome = "ERROR";
      errorCode = error instanceof AppError ? error.code : "INTERNAL";
      console.error("[reconcile] couldn't settle", order.id, error);
    }
    counts[outcome] += 1;
    // What changed shows on the buyer's timeline, marked as done by the system.
    if (outcome !== "WAITING")
      await ctx.db.activityLog
        .create({
          data: {
            actorId: order.buyerId,
            actorRole: "SYSTEM",
            action: "order.reconcile",
            targetType: "Order",
            targetId: order.id,
            input: { kind: order.kind, outcome },
            status: outcome === "ERROR" ? "FAILED" : "SUCCESS",
            errorCode,
            txHash: order.txHash,
            app: "worker",
          },
        })
        .catch((error: unknown) => console.error("[reconcile] log row", error));
  }
  return { looked: orders.length, ...counts };
}
