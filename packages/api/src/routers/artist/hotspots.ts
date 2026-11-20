import { z } from "zod";

import type { StoredFeature } from "@actiontokens/geo/map-geometry";

import {
  createHotspot,
  dropHotspotNow,
  getHotspot,
  listHotspots,
  removeHotspot,
  setHotspotPaused,
  updateHotspot,
} from "../../services/artist/hotspots";
import { actingArtistProcedure, createRouter } from "../../trpc";
import { pinFields } from "./pins";

const point = z.tuple([z.number(), z.number()]);

/** A drawn area as the portal stores it: a polygon ring of [lat, lng], circles with their centre and radius. */
const area = z.object({
  shape: z.enum(["circle", "rectangle", "polygon"]),
  feature: z.object({
    type: z.literal("Feature"),
    properties: z
      .object({ center: point.optional(), radiusMetres: z.number().optional() })
      .nullable(),
    geometry: z.object({
      type: z.literal("Polygon"),
      coordinates: z.array(z.array(point).max(200)).length(1),
    }),
  }),
});

const hotspotFields = {
  title: pinFields.title,
  description: pinFields.description,
  imageUrl: pinFields.imageUrl,
  link: pinFields.link,
  type: pinFields.type,
  visibility: pinFields.visibility,
  tierId: pinFields.tierId,
  reward: pinFields.reward,
  claimLimit: pinFields.claimLimit,
  autoCollect: pinFields.autoCollect,
  isMultiSpot: pinFields.isMultiSpot,
  tags: pinFields.tags,
  layerId: pinFields.layerId,
  look: pinFields.look,
  area,
  dropEveryDays: z.number().int(),
  pinDurationDays: z.number().int(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  spotsPerDrop: z.number().int(),
};

const asStored = <T extends { area?: z.infer<typeof area> }>(input: T) => ({
  ...input,
  area: input.area && { ...input.area, feature: input.area.feature as StoredFeature },
});

const hotspotId = z.object({ hotspotId: z.string().min(1) });

/** Hotspots: areas where pins drop on a schedule (see services/artist/hotspots). */
export const hotspotsRouter = createRouter({
  hotspots: actingArtistProcedure.query(({ ctx }) => listHotspots(ctx, ctx.artist)),

  hotspot: actingArtistProcedure
    .input(hotspotId)
    .query(({ ctx, input }) => getHotspot(ctx, ctx.artist, input.hotspotId)),

  createHotspot: actingArtistProcedure.input(z.object(hotspotFields)).mutation(({ ctx, input }) => {
    const stored = asStored(input);
    return createHotspot(ctx, ctx.artist, { ...stored, area: stored.area });
  }),

  updateHotspot: actingArtistProcedure
    .input(
      z
        .object(hotspotFields)
        .partial()
        .extend({ hotspotId: z.string().min(1) }),
    )
    .mutation(({ ctx, input }) => updateHotspot(ctx, ctx.artist, asStored(input))),

  setPaused: actingArtistProcedure
    .input(hotspotId.extend({ paused: z.boolean() }))
    .mutation(({ ctx, input }) => setHotspotPaused(ctx, ctx.artist, input)),

  dropNow: actingArtistProcedure
    .input(hotspotId)
    .mutation(({ ctx, input }) => dropHotspotNow(ctx, ctx.artist, input.hotspotId)),

  removeHotspot: actingArtistProcedure
    .input(hotspotId)
    .mutation(({ ctx, input }) => removeHotspot(ctx, ctx.artist, input.hotspotId)),
});
