import { z } from "zod";

import { RECHARGE_PACKAGES_USD } from "@actiontokens/chain";

import { cancelPurchase } from "../../services/purchase";
import { quoteRecharge, startRecharge, submitRecharge } from "../../services/recharge";
import { authedProcedure, createRouter, publicProcedure } from "../../trpc";

const rechargeInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("TOP_UP"), packageUsd: z.enum(RECHARGE_PACKAGES_USD) }),
  z.object({
    kind: z.literal("TOKEN_TRUST"),
    organizationId: z.string().min(1),
    /** Subscribing: ACTION, USDC, XLM or card (plan 33) */
    currency: z.enum(["ACTION", "USDC", "XLM", "USD"]),
  }),
]);

export const rechargeRouter = createRouter({
  /** What can be bought, for the page. The server alone decides what each package gives. */
  options: publicProcedure.query(() => ({
    packagesUsd: [...RECHARGE_PACKAGES_USD],
  })),

  /** The price breakdown. Works signed out (shows "Sign in to pay"). */
  quote: publicProcedure
    .input(rechargeInput)
    .query(({ ctx, input }) => quoteRecharge(ctx, ctx.session?.user ?? null, input)),

  start: authedProcedure
    .input(rechargeInput)
    .mutation(({ ctx, input }) => startRecharge(ctx, ctx.session.user, input)),

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
    .mutation(({ ctx, input }) => submitRecharge(ctx, ctx.session.user, input)),

  cancel: authedProcedure
    .input(z.object({ orderId: z.string().min(1) }))
    .mutation(({ ctx, input }) => cancelPurchase(ctx, ctx.session.user, input.orderId)),
});
