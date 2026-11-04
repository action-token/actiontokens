import { z } from "zod";

import {
  addSpot,
  createPin,
  getPin,
  listPins,
  moveSpot,
  pinOptions,
  removePin,
  removeSpot,
  setPinHidden,
  updatePin,
} from "../../services/artist/pins";
import { artistProcedure, createRouter } from "../../trpc";

export const reward = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("NONE") }),
  z.object({ kind: z.literal("FAN_TOKEN"), amount: z.string().trim().max(24).optional() }),
  z.object({ kind: z.literal("ITEM"), itemId: z.string().min(1) }),
]);

export const pinFields = {
  title: z.string().trim().max(120),
  description: z.string().max(2500),
  imageUrl: z.string().url().nullish(),
  link: z.string().max(500).nullish(),
  type: z.enum(["EVENT", "BOUNTY", "EXPERIENCE", "LAUNCH", "LANDMARK", "OTHER"]),
  visibility: z.enum(["PUBLIC", "FOLLOWERS", "SUBSCRIBERS", "MEMBERS", "TIER"]),
  tierId: z.string().nullish(),
  reward,
  claimLimit: z.number().int(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  autoCollect: z.boolean(),
  isMultiSpot: z.boolean(),
  eventId: z.string().nullish(),
  tags: z.array(z.string().max(60)).max(20),
};

const pinId = z.object({ pinId: z.string().min(1) });
const spotPlace = z.object({
  spotId: z.string().min(1),
  latitude: z.number(),
  longitude: z.number(),
});

/** Pins an artist drops on the map (see services/artist/pins). */
export const pinsRouter = createRouter({
  pins: artistProcedure.query(({ ctx }) => listPins(ctx, ctx.artist)),

  pin: artistProcedure.input(pinId).query(({ ctx, input }) => getPin(ctx, ctx.artist, input.pinId)),

  /** What the form offers: reward items, tiers, events, the artist's tags, the fan token. */
  pinOptions: artistProcedure.query(({ ctx }) => pinOptions(ctx, ctx.artist)),

  createPin: artistProcedure
    .input(
      z.object({
        ...pinFields,
        latitude: z.number(),
        longitude: z.number(),
        radiusMeters: z.number(),
        spotCount: z.number().int(),
      }),
    )
    .mutation(({ ctx, input }) => createPin(ctx, ctx.artist, input)),

  updatePin: artistProcedure
    .input(
      z
        .object(pinFields)
        .partial()
        .extend({ pinId: z.string().min(1) }),
    )
    .mutation(({ ctx, input }) => updatePin(ctx, ctx.artist, input)),

  setPinHidden: artistProcedure
    .input(pinId.extend({ hidden: z.boolean() }))
    .mutation(({ ctx, input }) => setPinHidden(ctx, ctx.artist, input.pinId, input.hidden)),

  removePin: artistProcedure
    .input(pinId)
    .mutation(({ ctx, input }) => removePin(ctx, ctx.artist, input.pinId)),

  removeSpot: artistProcedure
    .input(z.object({ spotId: z.string().min(1) }))
    .mutation(({ ctx, input }) => removeSpot(ctx, ctx.artist, input.spotId)),

  addSpot: artistProcedure
    .input(spotPlace)
    .mutation(({ ctx, input }) => addSpot(ctx, ctx.artist, input)),

  moveSpot: artistProcedure
    .input(spotPlace)
    .mutation(({ ctx, input }) => moveSpot(ctx, ctx.artist, input)),
});
