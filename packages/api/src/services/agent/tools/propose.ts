import { z } from "zod";

import {
  type NamedRef,
  type PinChanges,
  type PinDefaults,
  type PinTypeName,
  UNLIMITED_COLLECTIONS,
} from "../contract";
import { geocode } from "../google";
import type { Run } from "../run";
import { defineTool, isoDay, parseDate, plural } from "./define";
import { findAnnouncements, findEvents, findHotspots, ownPins, PIN_TYPES } from "./scope";

/**
 * Proposals: the ONLY way the agent can change anything. Each tool checks what
 * it can (the items are the artist's own, dates make sense) and adds a
 * confirmation card. Nothing is written here: the chat API does that when the
 * artist confirms, after checking everything again.
 */
const MAX_PINS_PER_PROPOSAL = 200;
const DAY = 86_400_000;

const httpUrl = z
  .string()
  .url()
  .refine((u) => /^https?:\/\//i.test(u), "Only http(s) links");
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY);

function checkRange(start: Date, end: Date, what: string) {
  if (end <= start) throw new Error(`${what} must end after it starts.`);
}

/** Pins named either by ids or by a find_pins ref, limited to the artist's own. */
async function pinsFrom(run: Run, a: { pinIds?: string[]; ref?: string }): Promise<NamedRef[]> {
  const ids = a.ref ? run.result(a.ref, "pins").items.map((p) => p.id) : (a.pinIds ?? []);
  if (ids.length === 0) throw new Error("Name the pins: pass pinIds or a ref from find_pins.");
  const own = await ownPins(run.ctx.db, run.artist.id, ids);
  if (own.length === 0)
    throw new Error("None of those are this artist's pins. Use find_pins to get the right ids.");
  return own;
}

async function ownHotspot(run: Run, id: string): Promise<NamedRef> {
  const [hotspot] = await findHotspots(run.ctx.db, run.artist.id, { ids: [id], limit: 1 });
  if (!hotspot)
    throw new Error("That isn't one of this artist's hotspots. Use find_hotspots to get its id.");
  return { id: hotspot.id, title: hotspot.title };
}

async function ownEvent(run: Run, id: string): Promise<NamedRef> {
  const [event] = await findEvents(run.ctx.db, run.artist.id, { ids: [id], when: "any", limit: 1 });
  if (!event)
    throw new Error("That isn't one of this artist's events. Use find_events to get its id.");
  return { id: event.id, title: event.title };
}

async function ownAnnouncement(run: Run, id: string): Promise<NamedRef> {
  const [item] = await findAnnouncements(run.ctx.db, run.artist.id, { ids: [id], limit: 1 });
  if (!item)
    throw new Error(
      "That isn't one of this artist's announcements. Use find_announcements to get its id.",
    );
  return { id: item.id, title: item.title };
}

const done = (summary: string) => ({
  model: {
    proposed: true,
    summary,
    note: "The person sees a confirmation card and decides. Tell them briefly what you prepared; don't claim it's done.",
  },
  detail: "Ready for your review",
});

const dateField = z.string().optional().describe("YYYY-MM-DD");

export const proposeTools = [
  defineTool({
    name: "propose_pins",
    description:
      "Prepare NEW pins from a places ref (search_places / search_web_list / search_events) for the person to review and confirm. " +
      "Coordinates always come from the search, never from you. Places already pinned are skipped unless listed in `keys` or includeAlreadyPinned. " +
      "Settings you leave out use the artist's usual settings; the person can change everything on the card.",
    schema: z.object({
      ref: z.string(),
      keys: z
        .array(z.string())
        .max(MAX_PINS_PER_PROPOSAL)
        .optional()
        .describe("Only these places (keys from the ref); omit for all"),
      includeAlreadyPinned: z.boolean().default(false),
      type: z.enum(PIN_TYPES).optional(),
      startDate: dateField.describe("YYYY-MM-DD; default today"),
      endDate: dateField.describe("YYYY-MM-DD; or use durationDays"),
      durationDays: z.number().int().min(1).max(36500).optional(),
      autoCollect: z
        .boolean()
        .optional()
        .describe("Collected automatically when a fan walks into range"),
      pinNumber: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Collectible copies at each place"),
      radiusMetres: z.number().min(0).max(5000).optional(),
      collectionLimit: z.number().int().min(1).max(UNLIMITED_COLLECTIONS).optional(),
      grouping: z
        .enum(["per-location", "single-group"])
        .optional()
        .describe("One pin per place (default) or all places in one pin"),
    }),
    label: (a, run) => {
      const set = run.results.get(a.ref);
      const n = set && "items" in set ? (a.keys?.length ?? set.items.length) : 0;
      return `Preparing ${n ? plural(n, "pin") : "pins"} for your review…`;
    },
    run: (a, run) => {
      const set = run.result(a.ref, "places");
      const keyed = a.keys?.length ? set.items.filter((i) => a.keys!.includes(i.key)) : set.items;
      const items = keyed
        .filter((i) => a.includeAlreadyPinned || a.keys?.length || !i.alreadyPinned)
        .slice(0, MAX_PINS_PER_PROPOSAL);
      if (items.length === 0)
        throw new Error(
          "No places left to pin (they may all be pinned already). Tell the person, or use includeAlreadyPinned.",
        );

      const habits = run.artist.habits;
      const allEvents = items.every((i) => i.kind === "event");
      const start = a.startDate ? parseDate(a.startDate, "startDate") : new Date();
      const end = a.endDate
        ? parseDate(a.endDate, "endDate")
        : addDays(start, a.durationDays ?? habits?.durationDays ?? 30);
      checkRange(start, end, "The pins");

      const defaults: PinDefaults = {
        type: (a.type ?? (allEvents ? "EVENT" : (habits?.type ?? "LANDMARK"))) as PinTypeName,
        startDate: isoDay(start),
        endDate: isoDay(end),
        autoCollect: a.autoCollect ?? habits?.autoCollect ?? false,
        pinNumber: a.pinNumber ?? 1,
        radius: a.radiusMetres ?? 20,
        collectionLimit: a.collectionLimit ?? UNLIMITED_COLLECTIONS,
        grouping: a.grouping ?? "per-location",
      };
      const skipped = keyed.length - items.length;
      const summary = `Create ${plural(items.length, "pin")} from “${set.title}”${skipped ? ` (skipping ${skipped} already pinned)` : ""}`;
      run.propose({ type: "create_pins", items, defaults }, summary);
      return Promise.resolve(done(summary));
    },
  }),

  defineTool({
    name: "propose_pin_changes",
    description:
      "Prepare edits to, or removal from the map of, the artist's existing pins (by ids or a find_pins ref) for the person to confirm.",
    schema: z.object({
      mode: z.enum(["update", "delete"]),
      pinIds: z.array(z.string()).max(MAX_PINS_PER_PROPOSAL).optional(),
      ref: z.string().optional(),
      changes: z
        .object({
          title: z.string().min(3).max(120).optional(),
          description: z.string().max(5000).optional(),
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          link: httpUrl.optional(),
          image: httpUrl.optional(),
          collectionLimit: z.number().int().min(1).max(UNLIMITED_COLLECTIONS).optional(),
          autoCollect: z.boolean().optional(),
        })
        .optional(),
    }),
    label: (a) =>
      a.mode === "delete"
        ? "Preparing the removal for your review…"
        : "Preparing the changes for your review…",
    run: async (a, run) => {
      const pins = await pinsFrom(run, a);
      if (a.mode === "delete") {
        const summary = `Hide ${plural(pins.length, "pin")} from the map`;
        run.propose({ type: "hide_pins", pins }, summary);
        return done(summary);
      }
      const c = a.changes ?? {};
      const changes: PinChanges = { ...c };
      if (c.startDate) changes.startDate = isoDay(parseDate(c.startDate, "startDate"));
      if (c.endDate) changes.endDate = isoDay(parseDate(c.endDate, "endDate"));
      if (changes.startDate && changes.endDate)
        checkRange(new Date(changes.startDate), new Date(changes.endDate), "The pins");
      if (Object.keys(changes).length === 0) throw new Error("No changes given.");
      const summary = `Change ${Object.keys(changes).join(", ")} on ${plural(pins.length, "pin")}`;
      run.propose({ type: "update_pins", pins, changes }, summary);
      return done(summary);
    },
  }),

  defineTool({
    name: "propose_hotspot",
    description:
      "Prepare a hotspot change for the person to confirm: create a new circular hotspot (an area that drops pins on a schedule), " +
      "pause / resume / delete one, or change an existing one's dates, rhythm or auto-collect (hotspotId from find_hotspots; applies to future drops).",
    schema: z.object({
      mode: z.enum(["create", "pause", "resume", "delete", "update"]),
      hotspotId: z.string().optional(),
      title: z.string().min(3).max(120).optional(),
      description: z.string().max(2000).optional(),
      place: z.string().optional().describe("create: where the centre is (address / landmark)"),
      lat: z.number().min(-90).max(90).optional(),
      lng: z.number().min(-180).max(180).optional(),
      radiusMetres: z.number().min(50).max(50_000).optional(),
      type: z.enum(PIN_TYPES).optional(),
      pinNumber: z.number().int().min(1).max(100).optional().describe("Pins per drop"),
      collectionLimit: z.number().int().min(1).max(UNLIMITED_COLLECTIONS).optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      dropEveryDays: z.number().int().min(1).max(365).optional(),
      pinDurationDays: z.number().int().min(1).max(365).optional(),
      autoCollect: z.boolean().optional(),
    }),
    label: (a) =>
      a.mode === "create"
        ? `Preparing a hotspot${a.place ? ` at ${a.place}` : ""}…`
        : "Preparing the hotspot change for your review…",
    run: async (a, run) => {
      if (a.mode === "update") {
        if (!a.hotspotId) throw new Error("hotspotId is required. Use find_hotspots.");
        const hotspot = await ownHotspot(run, a.hotspotId);
        const changes = {
          ...(a.startDate ? { startDate: isoDay(parseDate(a.startDate, "startDate")) } : {}),
          ...(a.endDate ? { endDate: isoDay(parseDate(a.endDate, "endDate")) } : {}),
          ...(a.dropEveryDays ? { dropEveryDays: a.dropEveryDays } : {}),
          ...(a.pinDurationDays ? { pinDurationDays: a.pinDurationDays } : {}),
          ...(a.autoCollect !== undefined ? { autoCollect: a.autoCollect } : {}),
        };
        if (Object.keys(changes).length === 0) throw new Error("No changes given.");
        const summary = `Change ${Object.keys(changes).join(", ")} on hotspot “${hotspot.title}” (future drops)`;
        run.propose({ type: "update_hotspot", hotspot, changes }, summary);
        return done(summary);
      }
      if (a.mode !== "create") {
        if (!a.hotspotId) throw new Error("hotspotId is required. Use find_hotspots.");
        const hotspot = await ownHotspot(run, a.hotspotId);
        const verb = { pause: "Pause", resume: "Resume", delete: "Delete" }[a.mode];
        const summary = `${verb} hotspot “${hotspot.title}”`;
        run.propose({ type: "hotspot_state", hotspot, op: a.mode }, summary);
        return done(summary);
      }

      if (!a.title) throw new Error("A new hotspot needs a title (what its pins are called).");
      let { lat, lng } = a;
      if ((lat === undefined || lng === undefined) && a.place) {
        const hit = await geocode(a.place);
        if (!hit) throw new Error(`Couldn't find "${a.place}" on the map.`);
        ({ lat, lng } = hit);
      }
      if (lat === undefined || lng === undefined)
        throw new Error("Say where the hotspot is: `place`, or lat/lng from a search.");
      const start = a.startDate ? parseDate(a.startDate, "startDate") : new Date();
      const end = a.endDate ? parseDate(a.endDate, "endDate") : addDays(start, 90);
      checkRange(start, end, "The hotspot");
      const hotspot = {
        title: a.title,
        description: a.description,
        lat,
        lng,
        radiusMetres: a.radiusMetres ?? 500,
        type: (a.type ?? run.artist.habits?.type ?? "LANDMARK") as PinTypeName,
        startDate: isoDay(start),
        endDate: isoDay(end),
        dropEveryDays: a.dropEveryDays ?? 7,
        pinDurationDays: a.pinDurationDays ?? 7,
        pinNumber: a.pinNumber ?? 1,
        collectionLimit: a.collectionLimit ?? UNLIMITED_COLLECTIONS,
        autoCollect: a.autoCollect ?? run.artist.habits?.autoCollect ?? false,
      };
      const summary = `Create hotspot “${a.title}” (${hotspot.radiusMetres} m), dropping every ${plural(hotspot.dropEveryDays, "day")}`;
      run.propose({ type: "create_hotspot", hotspot }, summary);
      return done(summary);
    },
  }),

  defineTool({
    name: "propose_event",
    description:
      "Prepare an event change for the person to confirm: create a new event (fans can RSVP), or update / delete one of the artist's own (eventId from find_events).",
    schema: z.object({
      mode: z.enum(["create", "update", "delete"]),
      eventId: z.string().optional(),
      title: z.string().min(3).max(120).optional(),
      description: z.string().max(5000).optional(),
      startDate: dateField,
      endDate: dateField,
      venueName: z.string().max(200).optional(),
      address: z.string().max(300).optional(),
      place: z.string().optional().describe("Where it is, to find coordinates (address / venue)"),
      link: httpUrl.optional(),
      capacity: z.number().int().min(1).max(1_000_000).optional(),
    }),
    label: (a) =>
      a.mode === "create"
        ? `Preparing the event${a.title ? ` “${a.title}”` : ""}…`
        : "Preparing the event change for your review…",
    run: async (a, run) => {
      if (a.mode === "delete") {
        if (!a.eventId) throw new Error("eventId is required. Use find_events.");
        const event = await ownEvent(run, a.eventId);
        const summary = `Delete event “${event.title}”`;
        run.propose({ type: "delete_event", event }, summary);
        return done(summary);
      }
      let lat: number | undefined;
      let lng: number | undefined;
      if (a.place) {
        const hit = await geocode(a.place);
        if (hit) ({ lat, lng } = hit);
      }
      const fields = {
        ...(a.title ? { title: a.title } : {}),
        ...(a.description ? { description: a.description } : {}),
        ...(a.startDate ? { startDate: isoDay(parseDate(a.startDate, "startDate")) } : {}),
        ...(a.endDate ? { endDate: isoDay(parseDate(a.endDate, "endDate")) } : {}),
        ...(a.venueName ? { venueName: a.venueName } : {}),
        ...(a.address ? { address: a.address } : {}),
        ...(lat !== undefined && lng !== undefined ? { lat, lng } : {}),
        ...(a.link ? { link: a.link } : {}),
        ...(a.capacity ? { capacity: a.capacity } : {}),
      };
      if (a.mode === "update") {
        if (!a.eventId) throw new Error("eventId is required. Use find_events.");
        const event = await ownEvent(run, a.eventId);
        if (Object.keys(fields).length === 0) throw new Error("No changes given.");
        const summary = `Change ${Object.keys(fields).join(", ")} on event “${event.title}”`;
        run.propose({ type: "update_event", event, changes: fields }, summary);
        return done(summary);
      }
      if (!fields.title || !fields.description || !fields.startDate || !fields.endDate)
        throw new Error("A new event needs a title, description, startDate and endDate.");
      checkRange(new Date(fields.startDate), new Date(fields.endDate), "The event");
      const summary = `Create event “${fields.title}” on ${fields.startDate}`;
      run.propose(
        {
          type: "create_event",
          event: {
            title: fields.title,
            description: fields.description,
            startDate: fields.startDate,
            endDate: fields.endDate,
            ...fields,
          },
        },
        summary,
      );
      return done(summary);
    },
  }),

  defineTool({
    name: "propose_announcement",
    description:
      "Prepare an announcement change for the person to confirm: create a news post fans see in the AR app, or update / delete one (announcementId from find_announcements).",
    schema: z.object({
      mode: z.enum(["create", "update", "delete"]),
      announcementId: z.string().optional(),
      title: z.string().min(1).max(100).optional(),
      body: z.string().max(5000).optional(),
      pinned: z.boolean().optional(),
      ctaLabel: z.string().max(40).optional(),
      ctaUrl: httpUrl.optional(),
      expiresAt: dateField.describe("YYYY-MM-DD: hidden from the feed after this"),
    }),
    label: (a) =>
      a.mode === "create"
        ? "Preparing the announcement…"
        : "Preparing the announcement change for your review…",
    run: async (a, run) => {
      if (a.mode !== "create") {
        if (!a.announcementId)
          throw new Error("announcementId is required. Use find_announcements.");
        const announcement = await ownAnnouncement(run, a.announcementId);
        if (a.mode === "delete") {
          const summary = `Delete announcement “${announcement.title}”`;
          run.propose({ type: "delete_announcement", announcement }, summary);
          return done(summary);
        }
        const changes = {
          ...(a.title ? { title: a.title } : {}),
          ...(a.body ? { body: a.body } : {}),
          ...(a.pinned !== undefined ? { pinned: a.pinned } : {}),
          ...(a.ctaLabel ? { ctaLabel: a.ctaLabel } : {}),
          ...(a.ctaUrl ? { ctaUrl: a.ctaUrl } : {}),
          ...(a.expiresAt ? { expiresAt: isoDay(parseDate(a.expiresAt, "expiresAt")) } : {}),
        };
        if (Object.keys(changes).length === 0) throw new Error("No changes given.");
        const summary = `Change ${Object.keys(changes).join(", ")} on announcement “${announcement.title}”`;
        run.propose({ type: "update_announcement", announcement, changes }, summary);
        return done(summary);
      }
      if (!a.title || !a.body) throw new Error("A new announcement needs a title and a body.");
      const summary = `Post announcement “${a.title}”`;
      run.propose(
        {
          type: "create_announcement",
          announcement: {
            title: a.title,
            body: a.body,
            pinned: a.pinned ?? false,
            ctaLabel: a.ctaLabel ?? null,
            ctaUrl: a.ctaUrl ?? null,
            expiresAt: a.expiresAt ? isoDay(parseDate(a.expiresAt, "expiresAt")) : null,
          },
        },
        summary,
      );
      return done(summary);
    },
  }),
];
