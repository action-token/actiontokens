import { z } from "zod";

import { ItemType } from "@bandcoin/db";

import { itemCardSelect, toItemCard } from "../../services/catalog/item-card";
import { authedProcedure, createRouter } from "../../trpc";

export const collectionRouter = createRouter({
  /** Everything you own (bought, received, gifted, claimed), newest first, with how many and where from. */
  mine: authedProcedure
    .input(z.object({ type: z.enum(ItemType).optional() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.ownership.findMany({
        where: {
          userId: ctx.session.user.id,
          quantity: { gt: 0 },
          item: { deletedAt: null, ...(input.type ? { type: input.type } : {}) },
        },
        orderBy: { acquiredAt: "desc" },
        take: 500,
        select: {
          quantity: true,
          source: true,
          acquiredAt: true,
          item: { select: itemCardSelect },
        },
      });
      const counts = await ctx.db.ownership.groupBy({
        by: ["itemId"],
        where: { userId: ctx.session.user.id, quantity: { gt: 0 }, item: { deletedAt: null } },
        _count: true,
      });
      return {
        total: counts.length,
        items: rows.map((row) => ({
          ...toItemCard(row.item),
          quantity: Number(row.quantity),
          source: row.source,
          acquiredAt: row.acquiredAt,
        })),
      };
    }),

  /** Songs you saved as favourites (private), newest first. */
  favorites: authedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.trackFavorite.findMany({
      where: { userId: ctx.session.user.id, item: { deletedAt: null } },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: { item: { select: itemCardSelect } },
    });
    return rows.map((row) => toItemCard(row.item));
  }),
});
