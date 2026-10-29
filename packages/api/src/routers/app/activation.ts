import { z } from "zod";

import { quoteActivation, startActivation, submitActivation } from "../../services/recharge/activation";
import { authedProcedure, createRouter, publicProcedure } from "../../trpc";

export const activationRouter = createRouter({
  /** The price breakdown for activating the signed-in fan's wallet. */
  quote: publicProcedure.query(({ ctx }) => quoteActivation(ctx, ctx.session?.user ?? null)),

  start: authedProcedure.mutation(({ ctx }) => startActivation(ctx, ctx.session.user)),

  submit: authedProcedure
    .input(
      z.object({
        orderId: z.string().min(1),
        card: z.object({ sourceId: z.string().min(1), verificationToken: z.string().optional() }),
      }),
    )
    .mutation(({ ctx, input }) => submitActivation(ctx, ctx.session.user, input)),
});
