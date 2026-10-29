import { z } from "zod";

import { AppError, ErrorCodes } from "@bandcoin/errors";

import { playbackFor } from "../../services/media/playback";
import { createRouter, publicProcedure } from "../../trpc";

export const mediaRouter = createRouter({
  /** What the player loads: the full track for owners, a 30 s preview for everyone else. */
  play: publicProcedure
    .input(z.object({ itemId: z.string().min(1) }))
    .query(({ ctx, input }) => playbackFor(ctx.db, ctx.session?.user.id ?? null, input.itemId)),

  /**
   * One listen. Every play start counts (previews too, signed in or not); the
   * player calls this when a song starts from the beginning.
   */
  recordPlay: publicProcedure
    .input(z.object({ itemId: z.string().min(1), sessionId: z.string().min(8).max(64), isPreview: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const item = await ctx.db.item.findFirst({ where: { id: input.itemId, deletedAt: null }, select: { id: true } });
      if (!item) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "This song doesn't exist." });
      ctx.activity.set({ targetType: "Item", targetId: item.id });
      return ctx.db.$transaction(async (tx) => {
        await tx.playEvent.create({
          data: { itemId: item.id, userId: ctx.session?.user.id ?? null, sessionId: input.sessionId, isPreview: input.isPreview },
        });
        return tx.item.update({ where: { id: item.id }, data: { playCount: { increment: 1 } }, select: { playCount: true } });
      });
    }),
});
