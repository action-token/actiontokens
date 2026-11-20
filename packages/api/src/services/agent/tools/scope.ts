import type { Prisma } from "@actiontokens/db";

import type { Context } from "../../../context";
import { type Box, inArea, type SearchArea } from "../area";
import { PUBLIC_PINS } from "../context";
import type {
  AnnouncementItem,
  EventItem,
  HotspotItem,
  PinItem,
  PinStatus,
  PinTypeName,
} from "../contract";

/**
 * The artist's own things, read for the tools. Every query filters on the
 * run's artist; ids the model passes in are only ever used together with that
 * filter, so an id from another artist simply matches nothing.
 */
type Db = Pick<Context, "db">["db"];

export const PIN_TYPES = [
  "LANDMARK",
  "EVENT",
  "EXPERIENCE",
  "LAUNCH",
  "BOUNTY",
  "OTHER",
] as const satisfies readonly PinTypeName[];

export type PinFilter = {
  ids?: string[];
  text?: string;
  type?: PinTypeName;
  status?: PinStatus | "current" | "any";
  area?: SearchArea | null;
  createdInLastDays?: number;
  limit: number;
};

export function pinStatus(
  pin: { approval: string; startsAt: Date; endsAt: Date },
  now = new Date(),
): PinStatus {
  if (pin.endsAt < now) return "expired";
  if (pin.approval === "REJECTED") return "rejected";
  if (pin.approval !== "APPROVED") return "in_review";
  if (pin.startsAt > now) return "upcoming";
  return "active";
}

function statusWhere(status: PinFilter["status"], now: Date): Prisma.PinWhereInput {
  switch (status) {
    case "active":
      return { approval: "APPROVED", startsAt: { lte: now }, endsAt: { gte: now } };
    case "upcoming":
      return { approval: "APPROVED", startsAt: { gt: now } };
    case "expired":
      return { endsAt: { lt: now } };
    case "in_review":
      return { approval: "PENDING", endsAt: { gte: now } };
    case "rejected":
      return { approval: "REJECTED" };
    case "any":
      return {};
    default:
      return { endsAt: { gte: now } };
  }
}

const boxWhere = (box: Box) => ({
  latitude: { gte: box.south, lte: box.north },
  longitude: { gte: box.west, lte: box.east },
});

/** The artist's pins matching `filter`, newest first, and how many matched in total. */
export async function findPins(db: Db, artistId: string, filter: PinFilter, now = new Date()) {
  const where: Prisma.PinWhereInput = {
    artistId,
    isHidden: false,
    ...PUBLIC_PINS,
    ...statusWhere(filter.ids ? "any" : filter.status, now),
    ...(filter.ids ? { id: { in: filter.ids } } : {}),
    ...(filter.type ? { type: filter.type } : {}),
    ...(filter.text
      ? {
          OR: [
            { title: { contains: filter.text, mode: "insensitive" } },
            { description: { contains: filter.text, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(filter.createdInLastDays
      ? { createdAt: { gte: new Date(now.getTime() - filter.createdInLastDays * 86_400_000) } }
      : {}),
    ...(filter.area ? boxWhere(filter.area.box) : {}),
  };
  const rows = await db.pin.findMany({
    where,
    orderBy: { createdAt: "desc" },
    // A polygon area is filtered after the box query, so fetch a little extra.
    take: filter.area?.rings ? filter.limit * 3 : filter.limit,
    select: {
      id: true,
      title: true,
      type: true,
      latitude: true,
      longitude: true,
      startsAt: true,
      endsAt: true,
      approval: true,
      imageUrl: true,
      hotspotId: true,
      spots: {
        where: { isHidden: false },
        select: { _count: { select: { claims: { where: { isHidden: false } } } } },
      },
    },
  });
  const inside = filter.area
    ? rows.filter((r) => inArea(filter.area!, r.latitude, r.longitude))
    : rows;
  const total = filter.area?.rings ? inside.length : await db.pin.count({ where });
  const items: PinItem[] = inside.slice(0, filter.limit).map((r) => ({
    id: r.id,
    title: r.title,
    type: r.type as PinTypeName,
    lat: r.latitude,
    lng: r.longitude,
    startDate: r.startsAt.toISOString(),
    endDate: r.endsAt.toISOString(),
    status: pinStatus(r, now),
    locations: r.spots.length,
    collected: r.spots.reduce((sum, s) => sum + s._count.claims, 0),
    image: r.imageUrl,
    hotspotId: r.hotspotId,
  }));
  return { items, total };
}

/** Ids that are the artist's own live pins, with their titles. */
export const ownPins = (db: Db, artistId: string, ids: string[]) =>
  db.pin.findMany({
    where: { id: { in: ids }, artistId, isHidden: false, ...PUBLIC_PINS },
    select: { id: true, title: true },
  });

export async function findHotspots(
  db: Db,
  artistId: string,
  opts: { ids?: string[]; text?: string; status?: "active" | "paused" | "any"; limit: number },
): Promise<HotspotItem[]> {
  const rows = await db.hotspot.findMany({
    where: {
      artistId,
      isHidden: false,
      ...(opts.ids ? { id: { in: opts.ids } } : {}),
      ...(opts.status === "active" ? { isActive: true } : {}),
      ...(opts.status === "paused" ? { isActive: false } : {}),
      ...(opts.text ? { title: { contains: opts.text, mode: "insensitive" } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: opts.limit,
    select: {
      id: true,
      title: true,
      isActive: true,
      dropEveryDays: true,
      pinDurationDays: true,
      startsAt: true,
      endsAt: true,
      autoCollect: true,
      geoJson: true,
      _count: { select: { pins: true } },
    },
  });
  return rows.map((h) => ({
    id: h.id,
    title: h.title || "Hotspot",
    isActive: h.isActive,
    dropEveryDays: h.dropEveryDays,
    pinDurationDays: h.pinDurationDays,
    startDate: h.startsAt.toISOString(),
    endDate: h.endsAt.toISOString(),
    autoCollect: h.autoCollect,
    drops: h._count.pins,
    geoJson: h.geoJson,
  }));
}

/** Pins in `box`, to flag places the artist already covers. */
export const pinsNear = (db: Db, artistId: string, box: Box, now = new Date()) =>
  db.pin.findMany({
    where: { artistId, isHidden: false, ...PUBLIC_PINS, endsAt: { gte: now }, ...boxWhere(box) },
    select: { latitude: true, longitude: true },
    take: 5000,
  });

export async function findEvents(
  db: Db,
  artistId: string,
  opts: { ids?: string[]; text?: string; when?: "upcoming" | "past" | "any"; limit: number },
  now = new Date(),
): Promise<EventItem[]> {
  const rows = await db.event.findMany({
    where: {
      artistId,
      ...(opts.ids ? { id: { in: opts.ids } } : {}),
      ...(opts.when === "upcoming" ? { endsAt: { gte: now } } : {}),
      ...(opts.when === "past" ? { endsAt: { lt: now } } : {}),
      ...(opts.text ? { title: { contains: opts.text, mode: "insensitive" } } : {}),
    },
    orderBy: { startsAt: opts.when === "past" ? "desc" : "asc" },
    take: opts.limit,
    select: {
      id: true,
      title: true,
      startsAt: true,
      endsAt: true,
      venueName: true,
      address: true,
      latitude: true,
      longitude: true,
      _count: { select: { rsvps: true } },
    },
  });
  return rows.map((e) => ({
    id: e.id,
    title: e.title,
    startDate: e.startsAt.toISOString(),
    endDate: e.endsAt.toISOString(),
    venueName: e.venueName,
    address: e.address,
    lat: e.latitude,
    lng: e.longitude,
    rsvps: e._count.rsvps,
  }));
}

export async function findAnnouncements(
  db: Db,
  artistId: string,
  opts: { ids?: string[]; text?: string; limit: number },
): Promise<AnnouncementItem[]> {
  const rows = await db.announcement.findMany({
    where: {
      artistId,
      ...(opts.ids ? { id: { in: opts.ids } } : {}),
      ...(opts.text ? { title: { contains: opts.text, mode: "insensitive" } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: opts.limit,
    select: {
      id: true,
      title: true,
      body: true,
      isPinned: true,
      createdAt: true,
      expiresAt: true,
      _count: { select: { comments: true } },
    },
  });
  return rows.map((a) => ({
    id: a.id,
    title: a.title,
    body: a.body,
    pinned: a.isPinned,
    createdAt: a.createdAt.toISOString(),
    expiresAt: a.expiresAt?.toISOString() ?? null,
    comments: a._count.comments,
  }));
}
