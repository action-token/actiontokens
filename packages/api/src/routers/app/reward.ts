import { myRewards } from "../../services/rewards/admin";
import { authedProcedure, createRouter } from "../../trpc";

/** A holder's own view: what recent reward rounds owe (or paid) their wallet. */
export const rewardRouter = createRouter({
  mine: authedProcedure.query(({ ctx }) => myRewards(ctx, ctx.session.user.walletAddress)),
});
