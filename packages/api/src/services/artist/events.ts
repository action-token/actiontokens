import { AppError, ErrorCodes } from "@bandcoin/errors";
import { isOwnS3Url } from "@bandcoin/storage";

import type { Context } from "../../context";
import { invalid } from "./items";

/**
 * Events: a gig, signing or listening party, in person, online or both.
 * Fans see them in the AR app and RSVP; pins and bounties can be linked to one.
 */
type ServiceCtx = Pick<Context, "db" | "activity">;
type ArtistRef = { id: string };

export type EventInput = {
  title: string;
  description: string;
  coverUrl?: string | null;
  startsAt: Date;
  endsAt: Date;
  venueName?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  link?: string | null;
  linkLabel?: string | null;
  /** null = unlimited RSVPs */
  capacity?: number | null;
};

/** A web address fans can open; anything else (javascript:, data:) is refused. */
export function webLink(value: string, what: string) {
  try {
    const url = new URL(value);
    if (url.protocol === "https:" || url.protocol === "http:") return url.toString();
  } catch {
    // falls through to the message
  }
  throw invalid(`${what} must be a web address starting with https://.`);
}

function checkEvent(input: Partial<EventInput>) {
  const { title, description } = input;
  if (title !== undefined && (title.trim().length === 0 || title.trim().length > 100)) throw invalid("Give the event a title of up to 100 characters.");
  if (description !== undefined && (description.trim().length === 0 || description.length > 4000)) throw invalid("Describe the event in up to 4000 characters.");
  if (input.coverUrl && !isOwnS3Url(input.coverUrl)) throw invalid("Upload the cover again.");
  if (input.venueName && input.venueName.length > 100) throw invalid("Keep the venue name under 100 characters.");
  if (input.address && input.address.length > 200) throw invalid("Keep the address under 200 characters.");
  if (input.capacity != null && (!Number.isInteger(input.capacity) || input.capacity < 1 || input.capacity > 1_000_000)) throw invalid("Capacity must be a whole number, or empty for no limit.");
  if (input.linkLabel && input.linkLabel.length > 30) throw invalid("Keep the link label under 30 characters.");
  if ((input.latitude == null) !== (input.longitude == null)) throw invalid("Set both latitude and longitude, or neither.");
  if (input.latitude != null && (input.latitude < -90 || input.latitude > 90)) throw invalid("Latitude must be between -90 and 90.");
  if (input.longitude != null && (input.longitude < -180 || input.longitude > 180)) throw invalid("Longitude must be between -180 and 180.");
}

function checkTimes(startsAt: Date, endsAt: Date) {
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) throw invalid("Pick a start and end time.");
  if (endsAt <= startsAt) throw invalid("The event has to end after it starts.");
}

/** The columns we write; an empty string means "clear it". */
function eventData(input: Partial<EventInput>) {
  const text = (value: string | null | undefined) => (value === undefined ? undefined : value?.trim() || null);
  return {
    ...(input.title !== undefined ? { title: input.title.trim() } : {}),
    ...(input.description !== undefined ? { description: input.description.trim() } : {}),
    ...(input.coverUrl !== undefined ? { coverUrl: input.coverUrl || null } : {}),
    ...(input.startsAt !== undefined ? { startsAt: input.startsAt } : {}),
    ...(input.endsAt !== undefined ? { endsAt: input.endsAt } : {}),
    ...(input.venueName !== undefined ? { venueName: text(input.venueName) } : {}),
    ...(input.address !== undefined ? { address: text(input.address) } : {}),
    ...(input.latitude !== undefined ? { latitude: input.latitude } : {}),
    ...(input.longitude !== undefined ? { longitude: input.longitude } : {}),
    ...(input.link !== undefined ? { link: input.link ? webLink(input.link.trim(), "The link") : null } : {}),
    ...(input.linkLabel !== undefined ? { linkLabel: text(input.linkLabel) } : {}),
    ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
  };
}

async function ownEvent(ctx: ServiceCtx, artist: ArtistRef, eventId: string) {
  const event = await ctx.db.event.findFirst({
    where: { id: eventId, artistId: artist.id },
    select: { id: true, startsAt: true, endsAt: true, capacity: true, _count: { select: { rsvps: true } } },
  });
  if (!event) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Event not found" });
  ctx.activity.set({ targetType: "Event", targetId: event.id });
  return event;
}

export async function listEvents(ctx: Pick<ServiceCtx, "db">, artist: ArtistRef) {
  const rows = await ctx.db.event.findMany({
    where: { artistId: artist.id },
    orderBy: { startsAt: "desc" },
    include: { _count: { select: { rsvps: true, pins: true, bounties: true } } },
  });
  return rows.map(({ _count, ...row }) => ({ ...row, rsvps: _count.rsvps, pins: _count.pins, bounties: _count.bounties }));
}

export async function createEvent(ctx: ServiceCtx, artist: ArtistRef, input: EventInput) {
  checkEvent(input);
  checkTimes(input.startsAt, input.endsAt);
  const event = await ctx.db.event.create({
    data: {
      ...eventData(input),
      artistId: artist.id,
      title: input.title.trim(),
      description: input.description.trim(),
      startsAt: input.startsAt,
      endsAt: input.endsAt,
    },
    select: { id: true },
  });
  ctx.activity.set({ targetType: "Event", targetId: event.id });
  return { eventId: event.id };
}

export async function updateEvent(ctx: ServiceCtx, artist: ArtistRef, input: Partial<EventInput> & { eventId: string }) {
  const event = await ownEvent(ctx, artist, input.eventId);
  checkEvent(input);
  checkTimes(input.startsAt ?? event.startsAt, input.endsAt ?? event.endsAt);
  if (input.capacity != null && input.capacity < event._count.rsvps)
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, { message: `${event._count.rsvps} fans have already RSVP'd. Capacity can't go below that.` });
  const data = eventData(input);
  if (Object.keys(data).length > 0) await ctx.db.event.update({ where: { id: event.id }, data });
  return { eventId: event.id };
}

/** Pins and bounties linked to the event stay; they just lose the link. RSVPs and comments go with it. */
export async function removeEvent(ctx: ServiceCtx, artist: ArtistRef, eventId: string) {
  const event = await ownEvent(ctx, artist, eventId);
  await ctx.db.event.delete({ where: { id: event.id } });
  return { eventId: event.id };
}
