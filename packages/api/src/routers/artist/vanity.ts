import { z } from "zod";

import {
  checkVanityName,
  claimVanity,
  getVanity,
  quoteVanity,
  startVanity,
  submitVanity,
} from "../../services/artist/vanity";
import { cancelPurchase } from "../../services/purchase";
import { artistProcedure, createRouter } from "../../trpc";

const payInput = z.object({
  purpose: z.enum(["RENEWAL", "NAME_CHANGE"]),
  name: z.string().max(60).optional(),
  /** USD: by card (plan 33) */
  currency: z.enum(["BANDCOIN", "XLM", "USDC", "USD"]),
});

/** The artist's short link, action-tokens.com/name (see services/artist/vanity). */
export const vanityRouter = createRouter({
  overview: artistProcedure.query(({ ctx }) => getVanity(ctx, ctx.artist)),

  /** Is this name usable and free? Called as the artist types. */
  check: artistProcedure
    .input(z.object({ name: z.string().max(60) }))
    .query(({ ctx, input }) => checkVanityName(ctx, ctx.artist, input.name)),

  /** The free first month. */
  claim: artistProcedure
    .input(z.object({ name: z.string().max(60) }))
    .mutation(({ ctx, input }) => claimVanity(ctx, ctx.artist, input.name)),

  quote: artistProcedure
    .input(payInput)
    .query(({ ctx, input }) => quoteVanity(ctx, ctx.session.user, ctx.artist, input)),

  start: artistProcedure
    .input(payInput)
    .mutation(({ ctx, input }) => startVanity(ctx, ctx.session.user, ctx.artist, input)),

  submit: artistProcedure
    .input(
      z.object({
        orderId: z.string().min(1),
        xdr: z.string().min(1).optional(),
        card: z
          .object({ sourceId: z.string().min(1), verificationToken: z.string().optional() })
          .optional(),
      }),
    )
    .mutation(({ ctx, input }) => submitVanity(ctx, ctx.session.user, input)),

  cancel: artistProcedure
    .input(z.object({ orderId: z.string().min(1) }))
    .mutation(({ ctx, input }) => cancelPurchase(ctx, ctx.session.user, input.orderId)),
});
