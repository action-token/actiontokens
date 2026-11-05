import { z } from "zod";

import { enhancePrompt, MAX_ENHANCE_PROMPT } from "../../services/studio/enhance";
import { generateInput } from "../../services/studio/generate-input";
import { googleProvider } from "../../services/studio/google";
import { loadPricing, runPrice } from "../../services/studio/pricing";
import {
  library,
  LIBRARY_TYPES,
  removeGeneration,
  startGeneration,
} from "../../services/studio/generate";
import { getGeneration } from "../../services/studio/music";
import { authedProcedure, createRouter, publicProcedure } from "../../trpc";

/** Studio's image, video and writing tools, and the library of everything you've made. */
export const generateRouter = createRouter({
  /** What this exact run would cost, for the Generate button (refuses options the model lacks). */
  price: publicProcedure
    .input(generateInput)
    .query(async ({ ctx, input }) => ({ coins: runPrice(input, await loadPricing(ctx)) })),

  /** Rewrites the prompt in the box into a better one; free, nothing is generated. */
  enhance: authedProcedure
    .input(
      z.object({
        tool: z.enum(["IMAGE", "VIDEO", "TEXT", "MUSIC"]),
        prompt: z.string().max(MAX_ENHANCE_PROMPT),
      }),
    )
    .mutation(({ input }) => {
      const google = googleProvider();
      return enhancePrompt(input, (request) => google.write(request));
    }),

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
