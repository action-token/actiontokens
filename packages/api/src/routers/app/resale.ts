import { z } from "zod";

import { cancelPurchase } from "../../services/purchase";
import {
  MAX_LISTED,
  myListings,
  quoteCancel,
  quoteList,
  setListingPrice,
  soldHistory,
  startCancel,
  startList,
  submitCancel,
  submitList,
} from "../../services/resale/classic";
import { authedProcedure, createRouter } from "../../trpc";

const price = z.string().regex(/^\d{1,12}(\.\d{1,7})?$/, "Enter a price like 12.5");
const listInput = z.object({
  itemId: z.string().min(1),
  amount: z.number().int().min(1).max(MAX_LISTED),
  priceBandcoin: price,
  priceUsd: price,
});
const signed = z.object({ orderId: z.string().min(1), xdr: z.string().min(1) });

/** Holders sell the copies they own: list at their own prices, change a price, take copies back, see what sold. */
export const resaleRouter = createRouter({
  quoteList: authedProcedure
    .input(listInput)
    .query(({ ctx, input }) => quoteList(ctx, ctx.session.user, input)),
  startList: authedProcedure
    .input(listInput)
    .mutation(({ ctx, input }) => startList(ctx, ctx.session.user, input)),
  submitList: authedProcedure
    .input(signed)
    .mutation(({ ctx, input }) => submitList(ctx, ctx.session.user, input)),

  setPrice: authedProcedure
    .input(z.object({ listingId: z.string().min(1), priceBandcoin: price, priceUsd: price }))
    .mutation(({ ctx, input }) => setListingPrice(ctx, ctx.session.user, input)),

  quoteCancel: authedProcedure
    .input(z.object({ listingId: z.string().min(1) }))
    .query(({ ctx, input }) => quoteCancel(ctx, ctx.session.user, input)),
  startCancel: authedProcedure
    .input(z.object({ listingId: z.string().min(1) }))
    .mutation(({ ctx, input }) => startCancel(ctx, ctx.session.user, input)),
  submitCancel: authedProcedure
    .input(signed)
    .mutation(({ ctx, input }) => submitCancel(ctx, ctx.session.user, input)),

  /** Stops a listing or cancel order that hasn't been signed (the custodial countdown's Cancel). */
  cancelOrder: authedProcedure
    .input(z.object({ orderId: z.string().min(1) }))
    .mutation(({ ctx, input }) => cancelPurchase(ctx, ctx.session.user, input.orderId)),

  mine: authedProcedure.query(({ ctx }) => myListings(ctx, ctx.session.user)),
  sold: authedProcedure.query(({ ctx }) => soldHistory(ctx, ctx.session.user)),
});
