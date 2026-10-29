import { z } from "zod";

import {
  cancelRoyalty,
  listPayouts,
  listRoyaltyItems,
  payoutLines,
  quoteRoyalty,
  resumeRoyalty,
  startRoyalty,
  submitRoyaltyBatch,
} from "../../services/artist/royalty";
import { artistProcedure, createRouter } from "../../trpc";

const payInput = z.object({
  itemId: z.string().min(1),
  revenue: z.string().trim().min(1).max(24),
  currency: z.enum(["BANDCOIN", "XLM", "USDC"]),
});
const payoutId = z.object({ payoutId: z.string().min(1) });

/** Paying holders of a royalty item their share of revenue (see services/artist/royalty). */
export const royaltyRouter = createRouter({
  items: artistProcedure.query(({ ctx }) => listRoyaltyItems(ctx, ctx.artist)),

  /** Who gets what and the whole price. Refreshes while the artist looks at it. */
  quote: artistProcedure
    .input(payInput)
    .query(({ ctx, input }) => quoteRoyalty(ctx, ctx.session.user, ctx.artist, input)),

  start: artistProcedure
    .input(
      payInput.extend({
        report: z.object({
          url: z.string().url().max(1000),
          name: z.string().min(1).max(200),
          size: z.number().int().min(1),
          type: z.string().min(1).max(120),
        }),
      }),
    )
    .mutation(({ ctx, input }) => startRoyalty(ctx, ctx.session.user, ctx.artist, input)),

  /** One batch of up to 100 payments, in order. */
  submit: artistProcedure
    .input(payoutId.extend({ batchNo: z.number().int().min(1), xdr: z.string().min(1) }))
    .mutation(({ ctx, input }) => submitRoyaltyBatch(ctx, ctx.session.user, ctx.artist, input)),

  resume: artistProcedure
    .input(payoutId)
    .mutation(({ ctx, input }) => resumeRoyalty(ctx, ctx.session.user, ctx.artist, input)),

  cancel: artistProcedure
    .input(payoutId)
    .mutation(({ ctx, input }) => cancelRoyalty(ctx, ctx.artist, input)),

  history: artistProcedure.query(({ ctx }) => listPayouts(ctx, ctx.artist)),

  lines: artistProcedure
    .input(payoutId)
    .query(({ ctx, input }) => payoutLines(ctx, ctx.artist, input.payoutId)),
});
