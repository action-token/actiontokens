import { z } from "zod";

import {
  listFollowers,
  listSentGifts,
  MAX_GIFT,
  quoteGift,
  startGift,
  submitGift,
} from "../../services/artist/gifts";
import {
  giftableCopies,
  quoteCollectibleGift,
  startCollectibleGift,
  submitCollectibleGift,
} from "../../services/artist/collectible-gifts";
import { prepareGiftTakeBack, submitGiftTakeBack } from "../../services/artist/gift-take-back";
import { cancelPurchase } from "../../services/purchase";
import { artistProcedure, createRouter } from "../../trpc";

const collectibleInput = z.object({
  editionId: z.string().min(1),
  recipient: z.string().max(120),
});

const giftInput = z.object({
  recipient: z.string().max(120),
  amount: z.number().int().min(1).max(MAX_GIFT),
});

/** Give fans some of your fan token (see services/artist/gifts). The artist pays only the network fee. */
export const giftsRouter = createRouter({
  /** The price breakdown, and why it can't go through yet. Refreshes while the artist looks at it. */
  quote: artistProcedure
    .input(giftInput)
    .query(({ ctx, input }) => quoteGift(ctx, ctx.session.user, ctx.artist, input)),

  start: artistProcedure
    .input(giftInput)
    .mutation(({ ctx, input }) => startGift(ctx, ctx.session.user, ctx.artist, input)),

  submit: artistProcedure
    .input(z.object({ orderId: z.string().min(1), xdr: z.string().min(1) }))
    .mutation(({ ctx, input }) => submitGift(ctx, ctx.session.user, ctx.artist, input)),

  cancel: artistProcedure
    .input(z.object({ orderId: z.string().min(1) }))
    .mutation(({ ctx, input }) => cancelPurchase(ctx, ctx.session.user, input.orderId)),

  /** NFT copies the artist owns and can give (see services/artist/collectible-gifts) */
  copies: artistProcedure.query(({ ctx }) => giftableCopies(ctx, ctx.session.user)),

  quoteCollectible: artistProcedure
    .input(collectibleInput)
    .query(({ ctx, input }) => quoteCollectibleGift(ctx, ctx.session.user, input)),

  startCollectible: artistProcedure
    .input(collectibleInput)
    .mutation(({ ctx, input }) => startCollectibleGift(ctx, ctx.session.user, input)),

  submitCollectible: artistProcedure
    .input(z.object({ orderId: z.string().min(1), xdr: z.string().min(1) }))
    .mutation(({ ctx, input }) => submitCollectibleGift(ctx, ctx.session.user, input)),

  sent: artistProcedure.query(({ ctx }) => listSentGifts(ctx, ctx.session.user, ctx.artist)),

  /** Take back a gift the fan hasn't accepted yet (see services/artist/gift-take-back) */
  prepareTakeBack: artistProcedure
    .input(z.object({ orderId: z.string().min(1) }))
    .mutation(({ ctx, input }) =>
      prepareGiftTakeBack(ctx, ctx.session.user, ctx.artist, input.orderId),
    ),

  submitTakeBack: artistProcedure
    .input(z.object({ orderId: z.string().min(1), xdr: z.string().min(1) }))
    .mutation(({ ctx, input }) => submitGiftTakeBack(ctx, ctx.session.user, ctx.artist, input)),

  followers: artistProcedure
    .input(z.object({ search: z.string().max(60).optional() }))
    .query(({ ctx, input }) => listFollowers(ctx, ctx.artist, input.search)),
});
