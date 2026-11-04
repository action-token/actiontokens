import { z } from "zod";

import { boxAround } from "../area";
import type { PinStatus } from "../contract";
import { geocode } from "../google";
import { defineTool, plural } from "./define";
import { findAnnouncements, findEvents, findHotspots, findPins, PIN_TYPES } from "./scope";
import { resolveArea } from "./search";

/** Reading the artist's own pins, hotspots, events and announcements. */
const STATUSES = [
  "current",
  "active",
  "upcoming",
  "expired",
  "in_review",
  "rejected",
  "any",
] as const;
const STATUS_WORD: Record<(typeof STATUSES)[number], string> = {
  current: "",
  active: "active ",
  upcoming: "upcoming ",
  expired: "expired ",
  in_review: "in-review ",
  rejected: "rejected ",
  any: "",
};
const day = (iso: string) => iso.slice(0, 10);

export const brandTools = [
  defineTool({
    name: "find_pins",
    description:
      "Search the artist's OWN pins (drops) by text, type, status, area and age. Use before editing, deleting or reporting on pins. " +
      "Returns a ref (for show_results, propose_pin_changes, collection_report) and one line per pin: id | title | type | status | collections.",
    schema: z.object({
      text: z.string().optional().describe("Words in the title or description"),
      type: z.enum(PIN_TYPES).optional(),
      status: z
        .enum(STATUSES)
        .default("current")
        .describe('"current" = not expired (default); "any" includes expired'),
      where: z.string().optional().describe("Limit to an area (a place name). Omit for anywhere."),
      radiusKm: z
        .number()
        .min(0.1)
        .max(200)
        .optional()
        .describe("With `where` naming a point (address/landmark): pins within this distance"),
      createdInLastDays: z.number().int().min(1).max(3650).optional(),
      limit: z.number().int().min(1).max(200).default(50),
    }),
    label: (a) =>
      `Looking through your ${STATUS_WORD[a.status]}pins${a.text ? ` for “${a.text}”` : ""}…`,
    run: async (a, run) => {
      let area = null;
      if (a.where) {
        if (a.radiusKm) {
          const hit = await geocode(a.where);
          if (!hit) throw new Error(`Couldn't find "${a.where}" on the map.`);
          area = {
            name: `${a.radiusKm} km around ${hit.name}`,
            box: boxAround(hit.lat, hit.lng, a.radiusKm),
          };
        } else {
          area = await resolveArea(a.where);
        }
      }
      const { items, total } = await findPins(run.ctx.db, run.artist.id, {
        ...a,
        status: a.status as PinStatus | "current" | "any",
        area,
      });
      const ref = run.addResult({
        kind: "pins",
        title: a.text ? `Your pins matching “${a.text}”` : `Your ${STATUS_WORD[a.status]}pins`,
        items,
      });
      return {
        model: {
          ref,
          total,
          returned: items.length,
          pins: items.map(
            (p) =>
              `${p.id} | ${p.title} | ${p.type} | ${p.status} | ${p.collected} collections | ${day(p.startDate)}→${day(p.endDate)}`,
          ),
        },
        detail:
          total > items.length
            ? `Found ${plural(total, "pin")}, showing ${items.length}`
            : `Found ${plural(total, "pin")}`,
      };
    },
  }),

  defineTool({
    name: "find_hotspots",
    description:
      "List the artist's OWN hotspots (areas that drop pins on a schedule). Returns a ref and one line per hotspot: id | name | active/paused | schedule.",
    schema: z.object({
      text: z.string().optional().describe("Words in the hotspot's title"),
      status: z.enum(["active", "paused", "any"]).default("any"),
      limit: z.number().int().min(1).max(100).default(30),
    }),
    label: () => "Checking your hotspots…",
    run: async (a, run) => {
      const items = await findHotspots(run.ctx.db, run.artist.id, a);
      const ref = run.addResult({ kind: "hotspots", title: "Your hotspots", items });
      return {
        model: {
          ref,
          hotspots: items.map(
            (h) =>
              `${h.id} | ${h.title} | ${h.isActive ? "active" : "paused"} | drops every ${h.dropEveryDays}d, each lasts ${h.pinDurationDays}d | ${day(h.startDate)}→${day(h.endDate)} | ${h.drops} drops`,
          ),
        },
        detail: `Found ${plural(items.length, "hotspot")}`,
      };
    },
  }),

  defineTool({
    name: "find_events",
    description:
      "List the artist's OWN events (the ones fans can RSVP to). Returns a ref and one line per event: id | title | dates | venue | RSVPs.",
    schema: z.object({
      text: z.string().optional(),
      when: z.enum(["upcoming", "past", "any"]).default("upcoming"),
      limit: z.number().int().min(1).max(100).default(30),
    }),
    label: () => "Checking your events…",
    run: async (a, run) => {
      const items = await findEvents(run.ctx.db, run.artist.id, a);
      const ref = run.addResult({ kind: "events", title: "Your events", items });
      return {
        model: {
          ref,
          events: items.map(
            (e) =>
              `${e.id} | ${e.title} | ${day(e.startDate)}→${day(e.endDate)} | ${e.venueName ?? e.address ?? "no venue"} | ${e.rsvps} RSVPs`,
          ),
        },
        detail: `Found ${plural(items.length, "event")}`,
      };
    },
  }),

  defineTool({
    name: "find_announcements",
    description:
      "List the artist's OWN announcements (news posts fans see in the AR app). Returns a ref and one line per announcement: id | title | pinned | comments.",
    schema: z.object({
      text: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(30),
    }),
    label: () => "Checking your announcements…",
    run: async (a, run) => {
      const items = await findAnnouncements(run.ctx.db, run.artist.id, a);
      const ref = run.addResult({ kind: "announcements", title: "Your announcements", items });
      return {
        model: {
          ref,
          announcements: items.map(
            (n) =>
              `${n.id} | ${n.title} | ${n.pinned ? "pinned" : "not pinned"} | ${n.comments} comments${n.expiresAt ? ` | until ${day(n.expiresAt)}` : ""}`,
          ),
        },
        detail: `Found ${plural(items.length, "announcement")}`,
      };
    },
  }),
];
