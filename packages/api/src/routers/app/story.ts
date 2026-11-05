import { z } from "zod";

import {
  artistStories,
  markStoryViewed,
  storyArchive,
  storyRing,
} from "../../services/feed/stories";
import { authedProcedure, createRouter, publicProcedure } from "../../trpc";

/** Stories as fans see them: the ring row, one artist's live stories and archive, and marking one watched. */
export const storyRouter = createRouter({
  /** Artists with a live story, for the row at the top of the feed; open to anyone. */
  ring: publicProcedure.query(({ ctx }) => storyRing(ctx, ctx.session?.user ?? null)),

  /** One artist's live stories; ones the viewer can't open come back as a lock. */
  byArtist: publicProcedure
    .input(z.object({ slug: z.string().min(1).max(200) }))
    .query(({ ctx, input }) => artistStories(ctx, ctx.session?.user ?? null, input.slug)),

  /** One artist's past stories, newest first, a page at a time; the audience each had still applies. */
  archive: publicProcedure
    .input(
      z.object({ slug: z.string().min(1).max(200), cursor: z.string().min(1).max(100).optional() }),
    )
    .query(({ ctx, input }) => storyArchive(ctx, ctx.session?.user ?? null, input)),

  markViewed: authedProcedure
    .input(z.object({ storyId: z.string().min(1) }))
    .mutation(({ ctx, input }) => markStoryViewed(ctx, ctx.session.user, input.storyId)),
});
