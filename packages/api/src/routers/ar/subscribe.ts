import { z } from "zod";

import { AppError, ErrorCodes } from "@bandcoin/errors";

import type { Context, SessionUser } from "../../context";
import { cancelPurchase, ownOrder } from "../../services/purchase";
import { quoteRecharge, startRecharge, submitRecharge } from "../../services/recharge";
import { authedProcedure, createRouter, publicProcedure } from "../../trpc";

const artist = z.object({ artistId: z.string().min(1) });
const order = z.object({ orderId: z.string().min(1) });

/** The viewer's own fan-token order; any other order reads as not found. */
async function ownTrustOrder(ctx: Context, user: SessionUser, orderId: string) {
  const found = await ownOrder(ctx, user, orderId);
  if (found.kind !== "TOKEN_TRUST")
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Order not found" });
}

/**
 * Subscribing from the AR app: trusting an artist's fan token, the fan app's
 * "hold the token" order (TOKEN_TRUST) and nothing else. Top-ups and swaps stay
 * in the fan app.
 */
export const subscribeRouter = createRouter({
  quote: publicProcedure
    .input(artist)
    .query(({ ctx, input }) =>
      quoteRecharge(ctx, ctx.session?.user ?? null, {
        kind: "TOKEN_TRUST",
        artistId: input.artistId,
      }),
    ),

  start: authedProcedure
    .input(artist)
    .mutation(({ ctx, input }) =>
      startRecharge(ctx, ctx.session.user, { kind: "TOKEN_TRUST", artistId: input.artistId }),
    ),

  submit: authedProcedure
    .input(order.extend({ xdr: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await ownTrustOrder(ctx, ctx.session.user, input.orderId);
      return submitRecharge(ctx, ctx.session.user, { orderId: input.orderId, xdr: input.xdr });
    }),

  cancel: authedProcedure.input(order).mutation(async ({ ctx, input }) => {
    await ownTrustOrder(ctx, ctx.session.user, input.orderId);
    return cancelPurchase(ctx, ctx.session.user, input.orderId);
  }),
});
