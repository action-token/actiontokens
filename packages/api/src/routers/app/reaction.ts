import { z } from "zod";

import type { Context, SessionUser } from "../../context";
import { authedProcedure, createRouter, publicProcedure } from "../../trpc";

const itemInput = z.object({ itemId: z.string().min(1), on: z.boolean() });

/**
 * Like, dislike and favourite. Like and dislike are public counts and cancel
 * each other (one fan can't do both); favourite is a private saved list.
 * Setters take the wanted state (`on`), so a double click can't flip it back.
 */
export const reactionRouter = createRouter({
  /** Counts for everyone, plus the signed-in fan's own reactions, keyed by item id. */
  states: publicProcedure.input(z.object({ itemIds: z.array(z.string().min(1)).max(100) })).query(async ({ ctx, input }) => {
    const userId = ctx.session?.user.id;
    const mine = { itemId: { in: input.itemIds }, userId: userId ?? "" };
    const [items, liked, disliked, favorites] = await Promise.all([
      ctx.db.item.findMany({ where: { id: { in: input.itemIds } }, select: { id: true, _count: { select: { likes: true, dislikes: true } } } }),
      userId ? ctx.db.itemLike.findMany({ where: mine, select: { itemId: true } }) : [],
      userId ? ctx.db.itemDislike.findMany({ where: mine, select: { itemId: true } }) : [],
      userId ? ctx.db.trackFavorite.findMany({ where: mine, select: { itemId: true } }) : [],
    ]);
    const has = (rows: { itemId: string }[]) => new Set(rows.map((row) => row.itemId));
    const [likedSet, dislikedSet, favoriteSet] = [has(liked), has(disliked), has(favorites)];
    return Object.fromEntries(
      items.map((item) => [
        item.id,
        {
          likes: item._count.likes,
          dislikes: item._count.dislikes,
          liked: likedSet.has(item.id),
          disliked: dislikedSet.has(item.id),
          favorite: favoriteSet.has(item.id),
        },
      ]),
    );
  }),

  setLike: authedProcedure.input(itemInput).mutation(({ ctx, input }) => setVote(ctx, "like", input)),
  setDislike: authedProcedure.input(itemInput).mutation(({ ctx, input }) => setVote(ctx, "dislike", input)),

  setFavorite: authedProcedure.input(itemInput).mutation(async ({ ctx, input }) => {
    const key = { userId: ctx.session.user.id, itemId: input.itemId };
    ctx.activity.set({ targetType: "Item", targetId: input.itemId });
    if (input.on) await ctx.db.trackFavorite.upsert({ where: { userId_itemId: key }, create: key, update: {} });
    else await ctx.db.trackFavorite.deleteMany({ where: key });
    return { itemId: input.itemId, favorite: input.on };
  }),
});

type VoteCtx = Pick<Context, "db" | "activity"> & { session: { user: SessionUser } };

/** Sets a like or dislike, clears the opposite one, and reads back what is now saved. */
async function setVote(ctx: VoteCtx, kind: "like" | "dislike", input: { itemId: string; on: boolean }) {
  const key = { userId: ctx.session.user.id, itemId: input.itemId };
  ctx.activity.set({ targetType: "Item", targetId: input.itemId });
  return ctx.db.$transaction(async (tx) => {
    if (kind === "like") {
      if (input.on) {
        await tx.itemLike.upsert({ where: { userId_itemId: key }, create: key, update: {} });
        await tx.itemDislike.deleteMany({ where: key });
      } else {
        await tx.itemLike.deleteMany({ where: key });
      }
    } else if (input.on) {
      await tx.itemDislike.upsert({ where: { userId_itemId: key }, create: key, update: {} });
      await tx.itemLike.deleteMany({ where: key });
    } else {
      await tx.itemDislike.deleteMany({ where: key });
    }
    const [likes, dislikes, liked, disliked] = await Promise.all([
      tx.itemLike.count({ where: { itemId: input.itemId } }),
      tx.itemDislike.count({ where: { itemId: input.itemId } }),
      tx.itemLike.count({ where: key }),
      tx.itemDislike.count({ where: key }),
    ]);
    return { itemId: input.itemId, likes, dislikes, liked: liked > 0, disliked: disliked > 0 };
  });
}
