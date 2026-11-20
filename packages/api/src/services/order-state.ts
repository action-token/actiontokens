import { AppError, ErrorCodes } from "@actiontokens/errors";
import type { Db, OrderStatus, Prisma } from "@actiontokens/db";

/**
 * The one order flow every payment follows:
 *
 *   QUOTED → AWAITING_SIGNATURE → SUBMITTED → CONFIRMED → DELIVERED
 *                 ↘ CANCELED          ↘ FAILED → REFUNDED (card)
 */
export const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  QUOTED: ["AWAITING_SIGNATURE", "CANCELED", "FAILED"],
  AWAITING_SIGNATURE: ["SUBMITTED", "CANCELED", "FAILED"],
  SUBMITTED: ["CONFIRMED", "FAILED"],
  CONFIRMED: ["DELIVERED", "FAILED"],
  DELIVERED: ["REFUNDED"],
  CANCELED: [],
  FAILED: ["REFUNDED"],
  REFUNDED: [],
};

export const canTransition = (from: OrderStatus, to: OrderStatus) =>
  ORDER_TRANSITIONS[from].includes(to);

/** States `to` can be reached from. */
export const sourcesOf = (to: OrderStatus) =>
  (Object.keys(ORDER_TRANSITIONS) as OrderStatus[]).filter((from) => canTransition(from, to));

/**
 * Moves an order to `to`, atomically: the update only matches while the order
 * is still in a state that may move there, so two requests racing (a double
 * click, the worker and the browser) can't both win.
 */
export async function transitionOrder(
  db: Pick<Db, "order">,
  orderId: string,
  to: OrderStatus,
  data: Omit<Prisma.OrderUpdateManyMutationInput, "status"> = {},
) {
  const { count } = await db.order.updateMany({
    where: { id: orderId, status: { in: sourcesOf(to) } },
    data: { ...data, status: to },
  });
  if (count === 0) {
    const order = await db.order.findUnique({ where: { id: orderId }, select: { status: true } });
    if (!order) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Order not found" });
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, {
      message: `This order is already ${order.status.toLowerCase().replace("_", " ")}.`,
      details: { from: order.status, to },
    });
  }
}
