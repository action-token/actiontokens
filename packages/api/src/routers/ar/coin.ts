import { z } from "zod";

import { authedProcedure, createRouter } from "../../trpc";

/**
 * Mural Coins: an off-chain balance earned from mural scans. Earn-only for
 * now; what they buy is decided later.
 */
export const coinRouter = createRouter({
  balance: authedProcedure.query(async ({ ctx }) => {
    const row = await ctx.db.coinBalance.findUnique({ where: { userId: ctx.session.user.id } });
    return { balance: row?.balance ?? 0 };
  }),

  history: authedProcedure
    .input(z.object({ cursor: z.string().optional(), limit: z.number().int().min(1).max(50).default(30) }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.coinLedgerEntry.findMany({
        where: { userId: ctx.session.user.id },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        select: { id: true, amount: true, reason: true, note: true, createdAt: true, mural: { select: { id: true, title: true, autoTitle: true } } },
      });
      const more = rows.length > input.limit;
      const items = rows.slice(0, input.limit).map(({ mural, ...row }) => ({
        ...row,
        mural: mural ? { id: mural.id, title: mural.title ?? mural.autoTitle } : null,
      }));
      return { items, nextCursor: more ? items[items.length - 1]!.id : null };
    }),
});
