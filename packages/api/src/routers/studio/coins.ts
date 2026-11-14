import { z } from "zod";

import { catalog, coinsForUsd, loadPricing, musicPrices } from "../../services/studio/pricing";
import { studioBalance, studioLedger } from "../../services/studio/balance";
import { cancelPurchase } from "../../services/purchase";
import { quoteTopUp, startTopUp, submitTopUp } from "../../services/studio/topup";
import { studioUsage } from "../../services/studio/usage";
import { authedProcedure, createRouter, publicProcedure } from "../../trpc";

const topUp = z
  .object({
    currency: z.enum(["BANDCOIN", "XLM", "USDC", "USD"]),
    packageId: z.string().min(1).nullish(),
    usd: z.number().positive().max(10_000).nullish(),
  })
  .refine((input) => Boolean(input.packageId) !== (input.usd != null), {
    message: "Pick a package or an amount.",
  });

/** Studio coins: balance, history, prices, and topping up (see services/studio). */
export const coinsRouter = createRouter({
  balance: authedProcedure.query(async ({ ctx }) => ({
    coins: await studioBalance(ctx, ctx.session.user.id),
  })),

  ledger: authedProcedure
    .input(z.object({ cursor: z.string().min(1).nullish() }))
    .query(({ ctx, input }) => studioLedger(ctx, ctx.session.user.id, input.cursor ?? null)),

  /** Your own totals for a period: spent, bought, creations, and each by tool (services/studio/usage). */
  usage: authedProcedure
    .input(z.object({ days: z.union([z.literal(7), z.literal(30), z.literal(90)]).optional() }))
    .query(({ ctx, input }) => studioUsage(ctx, ctx.session.user.id, { days: input.days })),

  /** Every model with its options and price for one plain run, and music's prices. */
  prices: publicProcedure.query(async ({ ctx }) => {
    const pricing = await loadPricing(ctx);
    return { models: catalog(pricing), music: musicPrices(pricing) };
  }),

  packages: publicProcedure.query(async ({ ctx }) => {
    const packs = await ctx.db.studioPackage.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        description: true,
        priceUsd: true,
        bonusCoins: true,
        isPopular: true,
      },
    });
    return packs.map((pack) => ({
      ...pack,
      priceUsd: Number(pack.priceUsd),
      coins: coinsForUsd(Number(pack.priceUsd)),
      bonusCoins: Number(pack.bonusCoins),
    }));
  }),

  quote: authedProcedure
    .input(topUp)
    .query(({ ctx, input }) => quoteTopUp(ctx, ctx.session.user, input)),

  start: authedProcedure
    .input(topUp)
    .mutation(({ ctx, input }) => startTopUp(ctx, ctx.session.user, input)),

  submit: authedProcedure
    .input(
      z.object({
        orderId: z.string().min(1),
        xdr: z.string().min(1).optional(),
        card: z
          .object({ sourceId: z.string().min(1), verificationToken: z.string().optional() })
          .optional(),
      }),
    )
    .mutation(({ ctx, input }) => submitTopUp(ctx, ctx.session.user, input)),

  /** Cancel during the countdown (or a declined wallet popup): nothing was signed or sent. */
  cancel: authedProcedure
    .input(z.object({ orderId: z.string().min(1) }))
    .mutation(({ ctx, input }) => cancelPurchase(ctx, ctx.session.user, input.orderId)),
});
