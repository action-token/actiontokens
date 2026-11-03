import { z } from "zod";

import { getGeneration, MAX_PROMPT, recentMusic, startMusic } from "../../services/studio/music";
import { authedProcedure, createRouter } from "../../trpc";

/** Studio music: start a clip or a full song, watch it finish, see your latest runs. */
export const musicRouter = createRouter({
  start: authedProcedure
    .input(
      z.object({
        kind: z.enum(["CLIP", "SONG"]),
        prompt: z.string().max(MAX_PROMPT * 2),
      }),
    )
    .mutation(({ ctx, input }) => startMusic(ctx, ctx.session.user, input)),

  run: authedProcedure
    .input(z.object({ generationId: z.string().min(1) }))
    .query(({ ctx, input }) => getGeneration(ctx, ctx.session.user, input.generationId)),

  recent: authedProcedure.query(({ ctx }) => recentMusic(ctx, ctx.session.user)),
});
