import { z } from "zod";

import { createFanToken, getFanToken } from "../../services/artist/fan-token";
import { createTier, listTiers, removeTier, updateTier } from "../../services/artist/tiers";
import { artistProcedure, createRouter } from "../../trpc";

const tierFields = {
  name: z.string().trim().max(40),
  description: z.string().max(300),
  features: z.array(z.string().max(120)).max(20),
  requiredTokens: z.string().trim().max(20),
  color: z.string().max(9).optional(),
  isPopular: z.boolean().optional(),
};

/** The artist's fan token and membership tiers (see services/artist/fan-token and tiers). */
export const membershipsRouter = createRouter({
  fanToken: artistProcedure.query(({ ctx }) => getFanToken(ctx, ctx.artist)),

  createFanToken: artistProcedure
    .input(
      z.discriminatedUnion("mode", [
        z.object({ mode: z.literal("GENERATE"), coverUrl: z.string().url(), description: z.string().max(500).optional() }),
        z.object({ mode: z.literal("CUSTOM"), code: z.string().trim().max(12), coverUrl: z.string().url(), description: z.string().max(500).optional() }),
        z.object({ mode: z.literal("EXISTING"), code: z.string().trim().max(12), issuer: z.string().trim().max(60), coverUrl: z.string().url(), description: z.string().max(500).optional() }),
      ]),
    )
    .mutation(({ ctx, input }) => createFanToken(ctx, ctx.artist, ctx.session.user, input)),

  tiers: artistProcedure.query(({ ctx }) => listTiers(ctx, ctx.artist)),

  createTier: artistProcedure.input(z.object(tierFields)).mutation(({ ctx, input }) => createTier(ctx, ctx.artist, input)),

  updateTier: artistProcedure
    .input(z.object(tierFields).partial().extend({ tierId: z.string().min(1), isActive: z.boolean().optional() }))
    .mutation(({ ctx, input }) => updateTier(ctx, ctx.artist, input)),

  removeTier: artistProcedure.input(z.object({ tierId: z.string().min(1) })).mutation(({ ctx, input }) => removeTier(ctx, ctx.artist, input.tierId)),
});
