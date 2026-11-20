import { z } from "zod";

import {
  blockWallet,
  listBlocked,
  listRounds,
  queuePayout,
  queueSync,
  roundDetail,
  setOriginPot,
  unblockWallet,
} from "../../services/rewards/admin";
import { adminProcedure, createRouter } from "../../trpc";

const kind = z.enum(["origin", "quarter"]);
const id = z.object({ kind, id: z.string().min(1) });
/** Stellar's public key shape, so a typo can't block nobody. */
const wallet = z.string().regex(/^G[A-Z2-7]{55}$/, "That isn't a Stellar address");

/**
 * Admin › Holder rewards. Money moves only in the worker: these queue it and show where it is.
 * Monthly ("origin") rounds share a pot an admin sets; quarterly rounds pay by 90-day holdings.
 */
export const rewardsRouter = createRouter({
  rounds: adminProcedure
    .input(z.object({ kind }))
    .query(({ ctx, input }) => listRounds(ctx, input.kind)),
  round: adminProcedure.input(id).query(({ ctx, input }) => roundDetail(ctx, input.kind, input.id)),
  setPot: adminProcedure
    .input(
      z.object({
        monthYear: z.string().regex(/^\d{4}-\d{2}$/),
        amount: z.string().regex(/^\d{1,13}(\.\d{1,7})?$/, "An amount with up to 7 decimals"),
      }),
    )
    .mutation(({ ctx, input }) => setOriginPot(ctx, input.monthYear, input.amount)),
  sync: adminProcedure
    .input(z.object({ kind }))
    .mutation(({ ctx, input }) => queueSync(ctx, input.kind)),
  distribute: adminProcedure
    .input(id)
    .mutation(({ ctx, input }) => queuePayout(ctx, input.kind, input.id)),
  blocked: adminProcedure
    .input(z.object({ kind }))
    .query(({ ctx, input }) => listBlocked(ctx, input.kind)),
  block: adminProcedure
    .input(z.object({ kind, walletAddress: wallet, reason: z.string().trim().max(300).optional() }))
    .mutation(({ ctx, input }) =>
      blockWallet(ctx, input.kind, { walletAddress: input.walletAddress, reason: input.reason }),
    ),
  unblock: adminProcedure
    .input(id)
    .mutation(({ ctx, input }) => unblockWallet(ctx, input.kind, input.id)),
});
