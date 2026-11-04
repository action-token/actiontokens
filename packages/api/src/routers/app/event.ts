import { z } from "zod";

import { upcomingEvents } from "../../services/feed/sidebar";
import { createRouter, publicProcedure } from "../../trpc";

/** Events across artists, open to anyone. */
export const eventRouter = createRouter({
  upcoming: publicProcedure
    .input(z.object({ limit: z.number().int().min(1).max(20).default(4) }))
    .query(({ ctx, input }) => upcomingEvents(ctx, input)),
});
