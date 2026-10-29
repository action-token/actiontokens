import { z } from "zod";

import { applyAsArtist, quoteIssuerOpening, startIssuerOpening, submitIssuerOpening } from "../../services/artist/onboarding";
import { cancelPurchase } from "../../services/purchase";
import { authedProcedure, createRouter } from "../../trpc";

/** Applying to be an artist and paying to open the issuer account (see services/artist/onboarding). */
export const onboardingRouter = createRouter({
  submitApplication: authedProcedure
    .input(
      z.object({
        name: z.string().trim().min(2, "Use at least 2 characters").max(60, "Use at most 60 characters"),
        slug: z.string().trim().optional(),
        bio: z.string().trim().max(500).optional(),
      }),
    )
    .mutation(({ ctx, input }) => applyAsArtist(ctx, ctx.session.user, input)),

  /** The price breakdown for opening the issuer. Refreshes while the artist looks at it. */
  issuerQuote: authedProcedure.query(({ ctx }) => quoteIssuerOpening(ctx, ctx.session.user)),

  issuerStart: authedProcedure.mutation(({ ctx }) => startIssuerOpening(ctx, ctx.session.user)),

  issuerSubmit: authedProcedure
    .input(z.object({ orderId: z.string().min(1), xdr: z.string().min(1) }))
    .mutation(({ ctx, input }) => submitIssuerOpening(ctx, ctx.session.user, input)),

  issuerCancel: authedProcedure
    .input(z.object({ orderId: z.string().min(1) }))
    .mutation(({ ctx, input }) => cancelPurchase(ctx, ctx.session.user, input.orderId)),
});
