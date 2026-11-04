import { z } from "zod";

import { createStory, listMyStories, removeStory } from "../../services/artist/stories";
import { artistProcedure, createRouter } from "../../trpc";

/** An artist's 24-hour stories (see services/artist/stories). */
export const storiesRouter = createRouter({
  stories: artistProcedure.query(({ ctx }) => listMyStories(ctx, ctx.artist)),

  createStory: artistProcedure
    .input(
      z.object({
        type: z.enum(["IMAGE", "VIDEO"]),
        url: z.string().url(),
        thumbnailUrl: z.string().url().nullish(),
        caption: z.string().max(400).nullish(),
        audience: z.enum(["EVERYONE", "FOLLOWERS", "SUBSCRIBERS", "MEMBERS"]).optional(),
        tierId: z.string().nullish(),
      }),
    )
    .mutation(({ ctx, input }) => createStory(ctx, ctx.artist, input)),

  removeStory: artistProcedure
    .input(z.object({ storyId: z.string().min(1) }))
    .mutation(({ ctx, input }) => removeStory(ctx, ctx.artist, input.storyId)),
});
