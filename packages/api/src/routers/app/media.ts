import { z } from "zod";

import { playbackFor } from "../../services/media/playback";
import { createRouter, publicProcedure } from "../../trpc";

export const mediaRouter = createRouter({
  /** What the player loads: the full track for owners, a 30 s preview for everyone else. */
  play: publicProcedure
    .input(z.object({ itemId: z.string().min(1) }))
    .query(({ ctx, input }) => playbackFor(ctx.db, ctx.session?.user.id ?? null, input.itemId)),
});
