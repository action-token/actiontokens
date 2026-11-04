import { z } from "zod";

import { generateInput } from "../../services/studio/generate-input";
import {
  library,
  LIBRARY_TYPES,
  removeGeneration,
  startGeneration,
} from "../../services/studio/generate";
import { getGeneration } from "../../services/studio/music";
import { authedProcedure, createRouter } from "../../trpc";

/** Studio's image, video and writing tools, and the library of everything you've made. */
export const generateRouter = createRouter({
  start: authedProcedure
    .input(generateInput)
    .mutation(({ ctx, input }) => startGeneration(ctx, ctx.session.user, input)),

  run: authedProcedure
    .input(z.object({ generationId: z.string().min(1) }))
    .query(({ ctx, input }) => getGeneration(ctx, ctx.session.user, input.generationId)),

  library: authedProcedure
    .input(
      z.object({
        type: z.enum(LIBRARY_TYPES).optional(),
        cursor: z.string().nullish(),
      }),
    )
    .query(({ ctx, input }) => library(ctx, ctx.session.user, input)),

  remove: authedProcedure
    .input(z.object({ generationId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const removed = await removeGeneration(ctx, ctx.session.user, input.generationId);
      ctx.activity.set({ targetType: "Generation", targetId: input.generationId });
      return removed;
    }),
});
