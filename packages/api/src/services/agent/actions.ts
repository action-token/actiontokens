import { z } from "zod";

import { circleAround } from "@bandcoin/geo/map-geometry";
import { AppError, ErrorCodes } from "@bandcoin/errors";

import type { Context } from "../../context";
import {
  createAnnouncement,
  removeAnnouncement,
  updateAnnouncement,
} from "../artist/announcements";
import { createEvent, removeEvent, updateEvent } from "../artist/events";
import { createHotspot, removeHotspot, setHotspotPaused, updateHotspot } from "../artist/hotspots";
import { setPinHidden, updatePin } from "../artist/pins";
import { MAX_BATCH, startPinBatch, type BatchPayload } from "./batch";
import {
  type ActionEdits,
  type ActionResult,
  type PinDefaults,
  type ProposedAction,
  UNLIMITED_COLLECTIONS,
} from "./contract";

/**
 * Carries out a change the agent proposed, once the artist confirmed it.
 * Nothing the agent wrote is trusted: every id must be the artist's own (the
 * services check it), the card's edits are validated here, and the same rules
 * as the normal forms apply because the same services run.
 */
type ServiceCtx = Pick<Context, "db" | "activity">;
type ArtistRef = { id: string };

const DAY = 86_400_000;
const PIN_TYPES = ["EVENT", "BOUNTY", "EXPERIENCE", "LAUNCH", "LANDMARK", "OTHER"] as const;
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
const invalid = (message: string) => new AppError(ErrorCodes.VALIDATION_FAILED, { message });

const day = z.string().refine((value) => !Number.isNaN(new Date(value).getTime()), "Not a date");

/** What the card may change. Anything else is dropped before it gets here. */
export const ActionEditsInput = z.object({
  keep: z.array(z.string()).max(MAX_BATCH).optional(),
  defaults: z
    .object({
      type: z.enum(PIN_TYPES),
      startDate: day,
      endDate: day,
      autoCollect: z.boolean(),
      pinNumber: z.number().int().min(1).max(100),
      radius: z.number().min(0).max(5000),
      collectionLimit: z.number().int().min(1).max(UNLIMITED_COLLECTIONS),
      grouping: z.enum(["per-location", "single-group"]),
    })
    .partial()
    .optional(),
  draft: z.record(z.string(), z.unknown()).optional(),
}) satisfies z.ZodType<ActionEdits>;

/** A plain date means the whole day: the pin ends at its last moment. */
export function endOfDay(value: string) {
  const date = new Date(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(date.getTime() + DAY - 1) : date;
}

/** Validates with a schema, turning its first problem into a readable error. */
function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw invalid(issue ? `${issue.path.join(".") || "Input"}: ${issue.message}` : "Invalid input");
  }
  return result.data;
}

export async function executeAction(
  ctx: ServiceCtx,
  artist: ArtistRef,
  action: ProposedAction,
  edits: ActionEdits = {},
  /** The map layer the artist is in: new pins and hotspots go in it (checked by the services). */
  layerId: string | null = null,
): Promise<ActionResult> {
  switch (action.type) {
    case "create_pins":
      return createPins(ctx, artist, action, edits, layerId);
    case "update_pins":
      return updatePins(ctx, artist, action);
    case "hide_pins": {
      for (const pin of action.pins) await setPinHidden(ctx, artist, pin.id, true);
      return { message: `Hid ${plural(action.pins.length, "pin")} from the map.` };
    }
    case "hotspot_state": {
      const { hotspot, op } = action;
      if (op === "delete") await removeHotspot(ctx, artist, hotspot.id);
      else await setHotspotPaused(ctx, artist, { hotspotId: hotspot.id, paused: op === "pause" });
      return {
        message: {
          pause: "Hotspot paused.",
          resume: "Hotspot resumed.",
          delete: "Hotspot deleted.",
        }[op],
      };
    }
    case "update_hotspot": {
      const c = action.changes;
      await updateHotspot(ctx, artist, {
        hotspotId: action.hotspot.id,
        ...(c.startDate ? { startsAt: new Date(c.startDate) } : {}),
        ...(c.endDate ? { endsAt: endOfDay(c.endDate) } : {}),
        ...(c.dropEveryDays ? { dropEveryDays: c.dropEveryDays } : {}),
        ...(c.pinDurationDays ? { pinDurationDays: c.pinDurationDays } : {}),
        ...(c.autoCollect !== undefined ? { autoCollect: c.autoCollect } : {}),
      });
      return { message: `Updated hotspot “${action.hotspot.title}”.` };
    }
    case "create_hotspot":
      return makeHotspot(ctx, artist, { ...action.hotspot, ...edits.draft }, layerId);
    case "create_event":
      return makeEvent(ctx, artist, { ...action.event, ...edits.draft });
    case "update_event": {
      const { event } = await updateEventFrom(ctx, artist, action.event.id, action.changes);
      return { message: `Updated event “${event}”.`, id: action.event.id };
    }
    case "delete_event":
      await removeEvent(ctx, artist, action.event.id);
      return { message: `Deleted event “${action.event.title}”.` };
    case "create_announcement":
      return makeAnnouncement(ctx, artist, { ...action.announcement, ...edits.draft });
    case "update_announcement": {
      const c = action.changes;
      await updateAnnouncement(ctx, artist, {
        announcementId: action.announcement.id,
        ...(c.title !== undefined ? { title: c.title } : {}),
        ...(c.body !== undefined ? { body: c.body } : {}),
        ...(c.pinned !== undefined ? { isPinned: c.pinned } : {}),
        ...(c.ctaLabel !== undefined ? { ctaLabel: c.ctaLabel } : {}),
        ...(c.ctaUrl !== undefined ? { ctaUrl: c.ctaUrl } : {}),
        ...(c.expiresAt !== undefined
          ? { expiresAt: c.expiresAt ? new Date(c.expiresAt) : null }
          : {}),
      });
      return { message: `Updated announcement “${action.announcement.title}”.` };
    }
    case "delete_announcement":
      await removeAnnouncement(ctx, artist, action.announcement.id);
      return { message: `Deleted announcement “${action.announcement.title}”.` };
  }
}

// ─── Pins ───────────────────────────────────────────────────────────────────

async function createPins(
  ctx: ServiceCtx,
  artist: ArtistRef,
  action: Extract<ProposedAction, { type: "create_pins" }>,
  edits: ActionEdits,
  layerId: string | null,
): Promise<ActionResult> {
  const defaults = parse(ActionEditsInput.shape.defaults.unwrap().required(), {
    ...action.defaults,
    ...edits.defaults,
  }) satisfies PinDefaults;
  const start = new Date(defaults.startDate);
  const end = endOfDay(defaults.endDate);
  if (end <= start) throw invalid("The pins must end after they start.");

  const chosen = edits.keep
    ? action.items.filter((i) => edits.keep!.includes(i.key))
    : action.items;
  if (chosen.length === 0) throw invalid("Pick at least one place.");
  if (chosen.length > MAX_BATCH) throw invalid(`Create up to ${MAX_BATCH} pins at a time.`);

  const places: BatchPayload["places"] = chosen.map((place) => {
    // Events keep their own dates; everything else uses the card's dates.
    const own = place.kind === "event" && place.startDate && place.endDate;
    return {
      id: place.key,
      title: place.title.trim().slice(0, 120),
      description: (place.address ?? place.title).slice(0, 500),
      latitude: place.lat,
      longitude: place.lng,
      startsAt: (own ? new Date(place.startDate!) : start).toISOString(),
      endsAt: (own ? endOfDay(place.endDate!) : end).toISOString(),
      url: place.url,
      image: place.image,
      gPlaceId: place.gPlaceId,
    };
  });
  const { pinJobId } = await startPinBatch(ctx, artist, {
    places,
    options: {
      type: defaults.type,
      autoCollect: defaults.autoCollect,
      pinNumber: defaults.pinNumber,
      radius: defaults.radius,
      collectionLimit: defaults.collectionLimit,
      grouping: defaults.grouping,
      layerId,
    },
  });
  return { message: `Creating ${plural(places.length, "pin")}…`, pinJobId };
}

async function updatePins(
  ctx: ServiceCtx,
  artist: ArtistRef,
  action: Extract<ProposedAction, { type: "update_pins" }>,
): Promise<ActionResult> {
  const c = action.changes;
  for (const pin of action.pins)
    await updatePin(ctx, artist, {
      pinId: pin.id,
      ...(c.title !== undefined ? { title: c.title } : {}),
      ...(c.description !== undefined ? { description: c.description } : {}),
      ...(c.link !== undefined ? { link: c.link } : {}),
      ...(c.image !== undefined ? { imageUrl: c.image } : {}),
      ...(c.startDate ? { startsAt: new Date(c.startDate) } : {}),
      ...(c.endDate ? { endsAt: endOfDay(c.endDate) } : {}),
      ...(c.collectionLimit !== undefined
        ? { claimLimit: c.collectionLimit >= UNLIMITED_COLLECTIONS ? 0 : c.collectionLimit }
        : {}),
      ...(c.autoCollect !== undefined ? { autoCollect: c.autoCollect } : {}),
    });
  return { message: `Updated ${plural(action.pins.length, "pin")}.` };
}

// ─── Hotspots ───────────────────────────────────────────────────────────────

const HotspotDraftInput = z
  .object({
    title: z.string().trim().min(3).max(120),
    description: z.string().max(2000).optional(),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    radiusMetres: z.number().min(50).max(50_000),
    type: z.enum(PIN_TYPES),
    startDate: day,
    endDate: day,
    dropEveryDays: z.number().int().min(1).max(365),
    pinDurationDays: z.number().int().min(1).max(365),
    pinNumber: z.number().int().min(1).max(100),
    collectionLimit: z.number().int().min(1).max(UNLIMITED_COLLECTIONS),
    autoCollect: z.boolean(),
  })
  .refine((h) => endOfDay(h.endDate) > new Date(h.startDate), {
    message: "The hotspot must end after it starts",
  });

async function makeHotspot(
  ctx: ServiceCtx,
  artist: ArtistRef,
  raw: unknown,
  layerId: string | null,
): Promise<ActionResult> {
  const h = parse(HotspotDraftInput, raw);
  const { hotspotId } = await createHotspot(ctx, artist, {
    title: h.title,
    description: h.description,
    type: h.type,
    visibility: "PUBLIC",
    reward: { kind: "NONE" },
    claimLimit: h.collectionLimit >= UNLIMITED_COLLECTIONS ? 0 : h.collectionLimit,
    autoCollect: h.autoCollect,
    isMultiSpot: false,
    area: { shape: "circle", feature: circleAround({ lat: h.lat, lng: h.lng }, h.radiusMetres) },
    dropEveryDays: h.dropEveryDays,
    pinDurationDays: h.pinDurationDays,
    startsAt: new Date(h.startDate),
    endsAt: endOfDay(h.endDate),
    spotsPerDrop: h.pinNumber,
    layerId,
  });
  return { message: `Hotspot “${h.title}” created.`, id: hotspotId };
}

// ─── Events and announcements ───────────────────────────────────────────────

const EventDraftInput = z.object({
  title: z.string(),
  description: z.string(),
  startDate: day,
  endDate: day,
  venueName: z.string().nullish(),
  address: z.string().nullish(),
  lat: z.number().nullish(),
  lng: z.number().nullish(),
  link: z.string().nullish(),
  capacity: z.number().int().nullish(),
});

async function makeEvent(ctx: ServiceCtx, artist: ArtistRef, raw: unknown): Promise<ActionResult> {
  const e = parse(EventDraftInput, raw);
  const { eventId } = await createEvent(ctx, artist, {
    title: e.title,
    description: e.description,
    startsAt: new Date(e.startDate),
    endsAt: endOfDay(e.endDate),
    venueName: e.venueName,
    address: e.address,
    latitude: e.lat,
    longitude: e.lng,
    link: e.link,
    capacity: e.capacity,
  });
  return { message: `Event “${e.title}” created.`, id: eventId };
}

async function updateEventFrom(
  ctx: ServiceCtx,
  artist: ArtistRef,
  eventId: string,
  changes: Partial<z.infer<typeof EventDraftInput>>,
) {
  const c = parse(EventDraftInput.partial(), changes);
  await updateEvent(ctx, artist, {
    eventId,
    ...(c.title !== undefined ? { title: c.title } : {}),
    ...(c.description !== undefined ? { description: c.description } : {}),
    ...(c.startDate ? { startsAt: new Date(c.startDate) } : {}),
    ...(c.endDate ? { endsAt: endOfDay(c.endDate) } : {}),
    ...(c.venueName !== undefined ? { venueName: c.venueName } : {}),
    ...(c.address !== undefined ? { address: c.address } : {}),
    ...(c.lat !== undefined ? { latitude: c.lat } : {}),
    ...(c.lng !== undefined ? { longitude: c.lng } : {}),
    ...(c.link !== undefined ? { link: c.link } : {}),
    ...(c.capacity !== undefined ? { capacity: c.capacity } : {}),
  });
  return { event: c.title ?? "event" };
}

const AnnouncementDraftInput = z.object({
  title: z.string(),
  body: z.string(),
  pinned: z.boolean().default(false),
  ctaLabel: z.string().nullish(),
  ctaUrl: z.string().nullish(),
  expiresAt: z.string().nullish(),
});

async function makeAnnouncement(
  ctx: ServiceCtx,
  artist: ArtistRef,
  raw: unknown,
): Promise<ActionResult> {
  const a = parse(AnnouncementDraftInput, raw);
  const { announcementId } = await createAnnouncement(ctx, artist, {
    title: a.title,
    body: a.body,
    isPinned: a.pinned,
    ctaLabel: a.ctaLabel,
    ctaUrl: a.ctaUrl,
    expiresAt: a.expiresAt ? new Date(a.expiresAt) : null,
  });
  return { message: `Announcement “${a.title}” posted.`, id: announcementId };
}
