import { z } from "zod";

import { artistStories, markStoryViewed, storyRing } from "../../services/feed/stories";
import { authedProcedure, createRouter, publicProcedure } from "../../trpc";

/** Stories as fans see them: the ring row, one artist's stories, and marking one watched. */
export const storyRouter = createRouter({
  /** Artists with a live story, for the row at the top of the feed; open to anyone. */
  ring: publicProcedure.query(({ ctx }) => storyRing(ctx, ctx.session?.user ?? null)),

  /** One artist's live stories; ones the viewer can't open come back as a lock. */
  byArtist: publicProcedure
    .input(z.object({ slug: z.string().min(1).max(200) }))
    .query(({ ctx, input }) => artistStories(ctx, ctx.session?.user ?? null, input.slug)),

  markViewed: authedProcedure
    .input(z.object({ storyId: z.string().min(1) }))
    .mutation(({ ctx, input }) => markStoryViewed(ctx, ctx.session.user, input.storyId)),
});
