import { z } from "zod";

import { CURRENCIES } from "@bandcoin/chain";

import {
  cancelPurchase,
  quotePurchase,
  startPurchase,
  submitPurchase,
} from "../../services/purchase";
import { authedProcedure, createRouter, publicProcedure } from "../../trpc";

/** Most copies one purchase can include. */
const MAX_QUANTITY = 50;

const purchaseInput = z.object({
  listingId: z.string().min(1),
  quantity: z.number().int().min(1).max(MAX_QUANTITY),
  currency: z.enum(CURRENCIES),
});

export const orderRouter = createRouter({
  /** The price breakdown for the buy panel. Works signed out (shows "Sign in to pay"). */
  quote: publicProcedure.input(purchaseInput).query(async ({ ctx, input }) => {
    const { quote } = await quotePurchase(ctx, ctx.session?.user ?? null, input);
    return quote;
  }),

  start: authedProcedure
    .input(purchaseInput)
    .mutation(({ ctx, input }) => startPurchase(ctx, ctx.session.user, input)),

  submit: authedProcedure
    .input(
      z.object({
        orderId: z.string().min(1),
        xdr: z.string().min(1),
        card: z
          .object({ sourceId: z.string().min(1), verificationToken: z.string().optional() })
          .optional(),
      }),
    )
    .mutation(({ ctx, input }) => submitPurchase(ctx, ctx.session.user, input)),

  cancel: authedProcedure
    .input(z.object({ orderId: z.string().min(1) }))
    .mutation(({ ctx, input }) => cancelPurchase(ctx, ctx.session.user, input.orderId)),

  status: authedProcedure
    .input(z.object({ orderId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const order = await ctx.db.order.findFirst({
        where: { id: input.orderId, buyerId: ctx.session.user.id },
        select: {
          id: true,
          status: true,
          failureCode: true,
          txHash: true,
          quantity: true,
          itemId: true,
        },
      });
      return order;
    }),
});
