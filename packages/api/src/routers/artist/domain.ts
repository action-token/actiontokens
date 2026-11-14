import { z } from "zod";

import { addDomain, getDomain, reconnectDomain, removeDomain } from "../../services/domains";
import { artistProcedure, createRouter } from "../../trpc";

/** The artist's own domain showing their artist page (plan 32, services/domains). */
export const domainRouter = createRouter({
  /** Read fresh from the host each time, so it doubles as "Check now". */
  overview: artistProcedure.query(({ ctx }) => getDomain(ctx, ctx.artist)),

  add: artistProcedure
    .input(z.object({ domain: z.string().trim().min(1).max(300) }))
    .mutation(({ ctx, input }) => addDomain(ctx, ctx.artist, input.domain)),

  /** A domain copied from bandfan: put it on the host again. */
  reconnect: artistProcedure.mutation(({ ctx }) => reconnectDomain(ctx, ctx.artist)),

  remove: artistProcedure.mutation(({ ctx }) => removeDomain(ctx, ctx.artist)),
});
