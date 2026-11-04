import { z } from "zod";

import { liveTicket, livePrice, saveLiveRecording } from "../../services/studio/live";
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

  /** A one-minute ticket to open a live jam on the worker's relay, and the price per minute. */
  liveTicket: authedProcedure.mutation(async ({ ctx }) => {
    const pricePerMinute = await livePrice(ctx);
    return {
      url: process.env.LIVE_WS_URL ?? "ws://localhost:8080/live",
      ticket: liveTicket(ctx.session.user.id),
      pricePerMinute,
    };
  }),

  /** Keeps the recording of a jam with its live run. */
  saveRecording: authedProcedure
    .input(z.object({ generationId: z.string().min(1), url: z.string().url() }))
    .mutation(async ({ ctx, input }) => {
      const saved = await saveLiveRecording(ctx, ctx.session.user, input);
      ctx.activity.set({ targetType: "Generation", targetId: input.generationId });
      return saved;
    }),
});
