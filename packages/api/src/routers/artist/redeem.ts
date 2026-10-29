import { z } from "zod";

import { listRewards, lookupCode, redeemCode, redeemHistory, redeemSummary } from "../../services/artist/redeem";
import { artistProcedure, createRouter } from "../../trpc";

const code = z.object({ code: z.string().max(20) });
const page = z.object({ search: z.string().max(100).optional(), cursor: z.string().optional(), limit: z.number().int().min(1).max(50).optional() });

/** Check and redeem the codes fans get when they collect a pin (see services/artist/redeem). */
export const redeemRouter = createRouter({
  summary: artistProcedure.query(({ ctx }) => redeemSummary(ctx, ctx.artist)),

  /** Read-only, but a mutation so the check happens on demand and isn't cached. */
  lookup: artistProcedure.input(code).mutation(({ ctx, input }) => lookupCode(ctx, ctx.artist, input.code)),

  redeem: artistProcedure.input(code).mutation(({ ctx, input }) => redeemCode(ctx, ctx.artist, input.code)),

  rewards: artistProcedure.input(page).query(({ ctx, input }) => listRewards(ctx, ctx.artist, input)),

  history: artistProcedure.input(page).query(({ ctx, input }) => redeemHistory(ctx, ctx.artist, input)),
});
