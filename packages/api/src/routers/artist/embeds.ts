import { z } from "zod";

import {
  createEmbed,
  duplicateEmbed,
  embedStats,
  getEmbed,
  listEmbeds,
  removeEmbed,
  setEmbedEnabled,
  updateEmbed,
} from "../../services/artist/embeds";
import { artistProcedure, createRouter } from "../../trpc";

const embedFields = z.object({
  name: z.string().max(120),
  isEnabled: z.boolean(),
  centerLat: z.number(),
  centerLng: z.number(),
  zoom: z.number(),
  showUserLocation: z.boolean(),
  gestureMode: z.enum(["COOPERATIVE", "GREEDY"]),
  theme: z.enum(["AUTO", "LIGHT", "DARK"]),
  accentColor: z.string().max(7),
  pinSource: z.enum(["ALL", "ARTIST"]),
  pinTypes: z
    .array(z.enum(["EVENT", "LANDMARK", "EXPERIENCE", "LAUNCH", "BOUNTY", "OTHER"]))
    .max(6),
  showFilterChips: z.boolean(),
  showSearch: z.boolean(),
  showNearby: z.boolean(),
  showMurals: z.boolean(),
  eventsLabel: z.string().max(80),
  eventsUrl: z.string().max(500).nullable(),
  bountiesLabel: z.string().max(80),
  bountiesUrl: z.string().max(500).nullable(),
  allowedDomains: z.array(z.string().max(253)).max(40),
});

const embedId = z.object({ embedId: z.string().min(1) });

/** The artist's website maps (see services/artist/embeds). The map itself is served by the AR app. */
export const embedsRouter = createRouter({
  embeds: artistProcedure.query(({ ctx }) => listEmbeds(ctx, ctx.artist)),

  embed: artistProcedure
    .input(embedId)
    .query(({ ctx, input }) => getEmbed(ctx, ctx.artist, input.embedId)),

  embedStats: artistProcedure
    .input(embedId.extend({ days: z.number().int().min(7).max(90).default(30) }))
    .query(({ ctx, input }) => embedStats(ctx, ctx.artist, input.embedId, input.days)),

  createEmbed: artistProcedure
    .input(embedFields)
    .mutation(({ ctx, input }) => createEmbed(ctx, ctx.artist, input)),

  updateEmbed: artistProcedure
    .input(embedId.extend({ data: embedFields }))
    .mutation(({ ctx, input }) => updateEmbed(ctx, ctx.artist, input.embedId, input.data)),

  setEmbedEnabled: artistProcedure
    .input(embedId.extend({ isEnabled: z.boolean() }))
    .mutation(({ ctx, input }) => setEmbedEnabled(ctx, ctx.artist, input.embedId, input.isEnabled)),

  duplicateEmbed: artistProcedure
    .input(embedId)
    .mutation(({ ctx, input }) => duplicateEmbed(ctx, ctx.artist, input.embedId)),

  removeEmbed: artistProcedure
    .input(embedId)
    .mutation(({ ctx, input }) => removeEmbed(ctx, ctx.artist, input.embedId)),
});
