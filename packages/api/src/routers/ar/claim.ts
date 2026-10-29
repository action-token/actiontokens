import { z } from "zod";

import { claimOverview, prepareClaim, quoteClaim, submitClaim } from "../../services/ar/claim";
import { authedProcedure, createRouter } from "../../trpc";

const claimId = z.object({ claimId: z.string().min(1) });

/**
 * "Claim to wallet" for a collected pin's reward (see services/ar/claim.ts):
 * forPin → quote → prepare → sign (wallet, or the custodial countdown) → submit.
 */
export const claimRouter = createRouter({
  /** What the viewer's collected pin offers and where that stands; null if they haven't collected it. */
  forPin: authedProcedure
    .input(z.object({ spotId: z.string().min(1) }))
    .query(({ ctx, input }) => claimOverview(ctx, ctx.session.user.id, input.spotId)),

  quote: authedProcedure
    .input(claimId)
    .query(({ ctx, input }) => quoteClaim(ctx, ctx.session.user, input.claimId)),

  prepare: authedProcedure
    .input(claimId)
    .mutation(({ ctx, input }) => prepareClaim(ctx, ctx.session.user, input.claimId)),

  submit: authedProcedure
    .input(claimId.extend({ xdr: z.string().min(1).max(20_000) }))
    .mutation(({ ctx, input }) => submitClaim(ctx, ctx.session.user, input.claimId, input.xdr)),
});
