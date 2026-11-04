import { z } from "zod";

import { searchAll } from "../../services/catalog/search";
import { createRouter, publicProcedure } from "../../trpc";

export const searchRouter = createRouter({
  /** The search palette's results: items, artists and bounties anyone can see. */
  all: publicProcedure
    .input(z.object({ q: z.string().max(80) }))
    .query(({ ctx, input }) => searchAll(ctx, input.q)),
});
