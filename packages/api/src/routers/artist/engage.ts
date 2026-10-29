import { z } from "zod";

import { createAnnouncement, listAnnouncements, removeAnnouncement, updateAnnouncement } from "../../services/artist/announcements";
import { createEvent, listEvents, removeEvent, updateEvent } from "../../services/artist/events";
import { artistProcedure, createRouter } from "../../trpc";

const eventFields = {
  title: z.string().trim().max(120),
  description: z.string().max(4500),
  coverUrl: z.string().url().nullish(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  venueName: z.string().max(120).nullish(),
  address: z.string().max(240).nullish(),
  latitude: z.number().nullish(),
  longitude: z.number().nullish(),
  link: z.string().max(500).nullish(),
  linkLabel: z.string().max(60).nullish(),
  capacity: z.number().int().nullish(),
};

const announcementFields = {
  title: z.string().trim().max(120),
  body: z.string().max(2500),
  imageUrls: z.array(z.string().url()).max(8).optional(),
  isPinned: z.boolean().optional(),
  ctaLabel: z.string().max(60).nullish(),
  ctaUrl: z.string().max(500).nullish(),
  expiresAt: z.coerce.date().nullish(),
};

/** Events and announcements an artist posts to fans (see services/artist/events and announcements). */
export const engageRouter = createRouter({
  events: artistProcedure.query(({ ctx }) => listEvents(ctx, ctx.artist)),

  createEvent: artistProcedure.input(z.object(eventFields)).mutation(({ ctx, input }) => createEvent(ctx, ctx.artist, input)),

  updateEvent: artistProcedure
    .input(z.object(eventFields).partial().extend({ eventId: z.string().min(1) }))
    .mutation(({ ctx, input }) => updateEvent(ctx, ctx.artist, input)),

  removeEvent: artistProcedure.input(z.object({ eventId: z.string().min(1) })).mutation(({ ctx, input }) => removeEvent(ctx, ctx.artist, input.eventId)),

  announcements: artistProcedure.query(({ ctx }) => listAnnouncements(ctx, ctx.artist)),

  createAnnouncement: artistProcedure.input(z.object(announcementFields)).mutation(({ ctx, input }) => createAnnouncement(ctx, ctx.artist, input)),

  updateAnnouncement: artistProcedure
    .input(z.object(announcementFields).partial().extend({ announcementId: z.string().min(1) }))
    .mutation(({ ctx, input }) => updateAnnouncement(ctx, ctx.artist, input)),

  removeAnnouncement: artistProcedure
    .input(z.object({ announcementId: z.string().min(1) }))
    .mutation(({ ctx, input }) => removeAnnouncement(ctx, ctx.artist, input.announcementId)),
});
