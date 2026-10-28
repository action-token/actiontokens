import { fundsOf } from "@bandcoin/chain/server";

import { isCustodial } from "../../context";
import { createRouter, publicProcedure } from "../../trpc";

export const accountRouter = createRouter({
  /**
   * Who is signed in, for the header and account menu: profile, artist page
   * and spendable balances. Null when signed out, so pages can call it freely.
   */
  me: publicProcedure.query(async ({ ctx }) => {
    const sessionUser = ctx.session?.user;
    if (!sessionUser) return null;
    const [user, account] = await Promise.all([
      ctx.db.user.findUnique({
        where: { id: sessionUser.id },
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
          email: true,
          role: true,
          walletAddress: true,
          artist: { select: { slug: true, name: true, status: true } },
        },
      }),
      ctx.chain.loadAccount(sessionUser.walletAddress).catch(() => null),
    ]);
    if (!user) return null;
    return {
      ...user,
      walletType: sessionUser.walletType,
      custodial: isCustodial(sessionUser),
      /** False until the Stellar account exists (it needs its first XLM) */
      activated: account !== null,
      balances: fundsOf(account, ctx.chain.config.assets),
    };
  }),
});
