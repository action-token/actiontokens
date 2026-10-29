import { z } from "zod";

import { listFollowers, listSentGifts, MAX_GIFT, quoteGift, startGift, submitGift } from "../../services/artist/gifts";
import { cancelPurchase } from "../../services/purchase";
import { artistProcedure, createRouter } from "../../trpc";

const giftInput = z.object({ recipient: z.string().max(120), amount: z.number().int().min(1).max(MAX_GIFT) });

/** Give fans some of your fan token (see services/artist/gifts). The artist pays only the network fee. */
export const giftsRouter = createRouter({
  /** The price breakdown, and why it can't go through yet. Refreshes while the artist looks at it. */
  quote: artistProcedure.input(giftInput).query(({ ctx, input }) => quoteGift(ctx, ctx.session.user, ctx.artist, input)),

  start: artistProcedure.input(giftInput).mutation(({ ctx, input }) => startGift(ctx, ctx.session.user, ctx.artist, input)),

  submit: artistProcedure.input(z.object({ orderId: z.string().min(1), xdr: z.string().min(1) })).mutation(({ ctx, input }) => submitGift(ctx, ctx.session.user, input)),

  cancel: artistProcedure.input(z.object({ orderId: z.string().min(1) })).mutation(({ ctx, input }) => cancelPurchase(ctx, ctx.session.user, input.orderId)),

  sent: artistProcedure.query(({ ctx }) => listSentGifts(ctx, ctx.session.user)),

  followers: artistProcedure.input(z.object({ search: z.string().max(60).optional() })).query(({ ctx, input }) => listFollowers(ctx, ctx.artist, input.search)),
});
