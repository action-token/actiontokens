import type { PinType, Prisma } from "@bandcoin/db";
import { AppError, ErrorCodes } from "@bandcoin/errors";
import { generateRandomLocations, type HotspotShape } from "@bandcoin/geo";
import { featureCenter, haversineMetres, type StoredFeature } from "@bandcoin/geo/map-geometry";

import type { Context } from "../../context";
import { webLink } from "./events";
import { invalid } from "./items";
import {
  checkText,
  cleanTags,
  createPin,
  MAX_SPOTS,
  type PinInput,
  type PinReward,
  type PinVisibility,
  resolveReward,
  resolveTier,
} from "./pins";

/**
 * Hotspots: an area where pins drop on a schedule, as bandfan had them. Every
 * N days (from the start date) one pin drops with its spots at random points
 * inside the area, lasts a set number of days, and goes live without admin
 * review. Drops stop after the end date. The worker's `hotspot.drop` job runs
 * them; a drop slot is taken with a conditional update, so it never drops twice.
 */
type ServiceCtx = Pick<Context, "db" | "activity">;
type ArtistRef = { id: string };

const DAY_MS = 86_400_000;
/** How far from its centre a hotspot's area may reach. */
export const MAX_AREA_METERS = 50_000;
const MAX_DAYS = 365;
const MAX_POINTS = 200;
const SHAPES: HotspotShape[] = ["circle", "rectangle", "polygon"];

/** What every drop's pin looks like, besides its title, place and dates. */
export type HotspotTemplate = {
  description?: string;
  imageUrl?: string | null;
  link?: string | null;
  type: PinType;
  visibility: PinVisibility;
  tierId?: string | null;
  reward: PinReward;
  /** Fans per drop; 0 = no limit (only without a reward) */
  claimLimit: number;
  autoCollect: boolean;
  isMultiSpot: boolean;
  tags?: string[];
};

export type HotspotArea = { shape: HotspotShape; feature: StoredFeature };

export type HotspotInput = HotspotTemplate & {
  title: string;
  area: HotspotArea;
  dropEveryDays: number;
  pinDurationDays: number;
  startsAt: Date;
  endsAt: Date;
  spotsPerDrop: number;
};

export type UpdateHotspotInput = Partial<HotspotInput> & { hotspotId: string };

export type HotspotStatus = "SCHEDULED" | "ACTIVE" | "PAUSED" | "ENDED";

const wholeDays = (value: number, what: string) => {
  if (!Number.isInteger(value) || value < 1 || value > MAX_DAYS)
    throw invalid(`${what} must be between 1 and ${MAX_DAYS} days.`);
};

/** Where the area is and how far it reaches from its centre (metres). */
export function measureArea(area: HotspotArea) {
  if (!SHAPES.includes(area.shape)) throw invalid("Draw a circle, rectangle or shape.");
  const ring = area.feature?.geometry?.coordinates?.[0];
  if (!Array.isArray(ring) || ring.length < 4 || ring.length > MAX_POINTS)
    throw invalid("Draw the area on the map first.");
  for (const point of ring) {
    const [lat, lng] = point;
    if (!(Math.abs(lat ?? NaN) <= 90 && Math.abs(lng ?? NaN) <= 180))
      throw invalid("The area has a point off the map. Draw it again.");
  }
  const center = featureCenter(area.feature);
  const reach = Math.max(
    ...ring.map(([lat, lng]) => haversineMetres(center, { lat: lat!, lng: lng! })),
  );
  if (!(reach >= 10)) throw invalid("The area is too small. Draw it a little bigger.");
  if (reach > MAX_AREA_METERS)
    throw invalid(
      `Keep the area within ${MAX_AREA_METERS / 1000} km of its centre. Draw a smaller one.`,
    );
  return { center, reach: Math.ceil(reach) };
}

function checkSchedule(
  input: Pick<HotspotInput, "dropEveryDays" | "pinDurationDays" | "startsAt" | "endsAt">,
  now: Date,
  creating: boolean,
) {
  wholeDays(input.dropEveryDays, "Drop every");
  wholeDays(input.pinDurationDays, "Each drop's length");
  if (Number.isNaN(input.startsAt.getTime()) || Number.isNaN(input.endsAt.getTime()))
    throw invalid("Pick a start and end date.");
  if (input.endsAt <= input.startsAt) throw invalid("The hotspot has to end after it starts.");
  if (creating && input.endsAt <= now) throw invalid("The end date is already in the past.");
}

const checkSpots = (count: number) => {
  if (!Number.isInteger(count) || count < 1 || count > MAX_SPOTS)
    throw invalid(`Drop between 1 and ${MAX_SPOTS} spots each time.`);
};

/** Checks the pin part once, so a drop doesn't fail later on something the artist could fix now. */
async function cleanTemplate(
  ctx: ServiceCtx,
  artist: ArtistRef,
  input: HotspotTemplate & { title: string },
) {
  checkText(input);
  await resolveTier(ctx, artist, input.visibility, input.tierId);
  await resolveReward(ctx, artist, input.reward, input.claimLimit);
  const tags = cleanTags(input.tags).map((tag) => tag.label);
  return {
    description: input.description?.trim() || undefined,
    imageUrl: input.imageUrl || null,
    link: input.link?.trim() ? webLink(input.link.trim(), "The link") : null,
    type: input.type,
    visibility: input.visibility,
    tierId: input.visibility === "TIER" ? (input.tierId ?? null) : null,
    reward: input.reward,
    claimLimit: input.claimLimit,
    autoCollect: input.autoCollect,
    isMultiSpot: input.isMultiSpot,
    tags,
  } satisfies HotspotTemplate;
}

const templateOf = (json: Prisma.JsonValue) => json as unknown as HotspotTemplate;

export function hotspotStatus(
  hotspot: { isActive: boolean; startsAt: Date; endsAt: Date },
  now = new Date(),
): HotspotStatus {
  if (hotspot.endsAt <= now) return "ENDED";
  if (!hotspot.isActive) return "PAUSED";
  return hotspot.startsAt > now ? "SCHEDULED" : "ACTIVE";
}

/** The next drop after `from` on the hotspot's rhythm, skipping slots missed while down; null past the end. */
export function nextSlot(
  from: Date,
  hotspot: { dropEveryDays: number; endsAt: Date },
  now: Date,
): Date | null {
  const step = hotspot.dropEveryDays * DAY_MS;
  let next = from.getTime() + step;
  if (next <= now.getTime()) next += Math.ceil((now.getTime() - next) / step + 1e-9) * step;
  return next < hotspot.endsAt.getTime() ? new Date(next) : null;
}

async function ownHotspot(ctx: ServiceCtx, artist: ArtistRef, hotspotId: string) {
  const hotspot = await ctx.db.hotspot.findFirst({
    where: { id: hotspotId, artistId: artist.id, isHidden: false },
  });
  if (!hotspot) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Hotspot not found" });
  ctx.activity.set({ targetType: "Hotspot", targetId: hotspot.id });
  return hotspot;
}

export async function listHotspots(
  ctx: Pick<ServiceCtx, "db">,
  artist: ArtistRef,
  now = new Date(),
) {
  const rows = await ctx.db.hotspot.findMany({
    where: { artistId: artist.id, isHidden: false },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      title: true,
      shape: true,
      geoJson: true,
      isActive: true,
      dropEveryDays: true,
      pinDurationDays: true,
      spotsPerDrop: true,
      startsAt: true,
      endsAt: true,
      nextDropAt: true,
      lastDropAt: true,
      _count: { select: { pins: true } },
    },
  });
  return rows.map(({ _count, ...row }) => ({
    ...row,
    drops: _count.pins,
    status: hotspotStatus(row, now),
  }));
}

export async function getHotspot(
  ctx: ServiceCtx,
  artist: ArtistRef,
  hotspotId: string,
  now = new Date(),
) {
  const hotspot = await ownHotspot(ctx, artist, hotspotId);
  const drops = await ctx.db.pin.findMany({
    where: { hotspotId: hotspot.id },
    orderBy: { startsAt: "desc" },
    take: 20,
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      isHidden: true,
      claimLimit: true,
      claimsLeft: true,
      _count: { select: { spots: true } },
    },
  });
  return {
    ...hotspot,
    template: templateOf(hotspot.template),
    status: hotspotStatus(hotspot, now),
    drops: drops.map(({ _count, ...drop }) => ({ ...drop, spots: _count.spots })),
  };
}

export async function createHotspot(
  ctx: ServiceCtx,
  artist: ArtistRef,
  input: HotspotInput,
  now = new Date(),
) {
  checkSchedule(input, now, true);
  checkSpots(input.spotsPerDrop);
  measureArea(input.area);
  const template = await cleanTemplate(ctx, artist, input);
  const hotspot = await ctx.db.hotspot.create({
    data: {
      artistId: artist.id,
      title: input.title.trim(),
      template,
      spotsPerDrop: input.spotsPerDrop,
      dropEveryDays: input.dropEveryDays,
      pinDurationDays: input.pinDurationDays,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      autoCollect: input.autoCollect,
      isMultiSpot: input.isMultiSpot,
      shape: input.area.shape,
      geoJson: input.area.feature as unknown as Prisma.InputJsonValue,
      // The first drop is on the start date (or now, if that has passed).
      nextDropAt: input.startsAt,
    },
    select: { id: true },
  });
  ctx.activity.set({ targetType: "Hotspot", targetId: hotspot.id });
  const first = input.startsAt <= now ? await runScheduledDrop(ctx, hotspot.id, now) : null;
  return { hotspotId: hotspot.id, dropped: first?.outcome === "DROPPED" };
}

/** Changes apply to future drops; pins already dropped stay as they are. */
export async function updateHotspot(
  ctx: ServiceCtx,
  artist: ArtistRef,
  input: UpdateHotspotInput,
  now = new Date(),
) {
  const hotspot = await ownHotspot(ctx, artist, input.hotspotId);
  const started = hotspot.startsAt <= now;
  if (started && input.startsAt && input.startsAt.getTime() !== hotspot.startsAt.getTime())
    throw invalid("It has started already, so the start date stays.");
  const schedule = {
    dropEveryDays: input.dropEveryDays ?? hotspot.dropEveryDays,
    pinDurationDays: input.pinDurationDays ?? hotspot.pinDurationDays,
    startsAt: input.startsAt ?? hotspot.startsAt,
    endsAt: input.endsAt ?? hotspot.endsAt,
  };
  checkSchedule(schedule, now, input.endsAt !== undefined);
  if (input.spotsPerDrop !== undefined) checkSpots(input.spotsPerDrop);
  if (input.area) measureArea(input.area);
  const template = await cleanTemplate(ctx, artist, {
    ...templateOf(hotspot.template),
    title: hotspot.title,
    ...input,
  });

  // Keep the rhythm: before the start, the first drop follows the start date;
  // a running hotspot that had run out of drops gets one again if its end moved.
  let nextDropAt = hotspot.nextDropAt;
  if (!started) nextDropAt = schedule.startsAt;
  else if (!nextDropAt && schedule.endsAt > now)
    nextDropAt = hotspot.lastDropAt ? nextSlot(hotspot.lastDropAt, schedule, now) : now;
  if (nextDropAt && nextDropAt >= schedule.endsAt) nextDropAt = null;

  await ctx.db.hotspot.update({
    where: { id: hotspot.id },
    data: {
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      template,
      ...schedule,
      ...(input.spotsPerDrop !== undefined ? { spotsPerDrop: input.spotsPerDrop } : {}),
      autoCollect: template.autoCollect,
      isMultiSpot: template.isMultiSpot,
      ...(input.area
        ? {
            shape: input.area.shape,
            geoJson: input.area.feature as unknown as Prisma.InputJsonValue,
          }
        : {}),
      nextDropAt,
    },
  });
  return { hotspotId: hotspot.id };
}

export async function setHotspotPaused(
  ctx: ServiceCtx,
  artist: ArtistRef,
  input: { hotspotId: string; paused: boolean },
  now = new Date(),
) {
  const hotspot = await ownHotspot(ctx, artist, input.hotspotId);
  if (!input.paused && hotspot.endsAt <= now)
    throw invalid("This hotspot has ended. Move its end date to start it again.");
  await ctx.db.hotspot.update({
    where: { id: hotspot.id },
    data: {
      isActive: !input.paused,
      // Resuming drops at the next tick if a drop came due while paused (one, not a burst).
      ...(!input.paused && !hotspot.nextDropAt
        ? { nextDropAt: hotspot.startsAt > now ? hotspot.startsAt : now }
        : {}),
    },
  });
  return { hotspotId: hotspot.id, paused: input.paused };
}

/** Takes it off the map: the hotspot and every pin it dropped are hidden, nothing is deleted. */
export async function removeHotspot(ctx: ServiceCtx, artist: ArtistRef, hotspotId: string) {
  const hotspot = await ownHotspot(ctx, artist, hotspotId);
  await ctx.db.$transaction([
    ctx.db.pin.updateMany({ where: { hotspotId: hotspot.id }, data: { isHidden: true } }),
    ctx.db.hotspot.update({
      where: { id: hotspot.id },
      data: { isHidden: true, isActive: false, nextDropAt: null },
    }),
  ]);
  return { hotspotId: hotspot.id };
}

type DropOutcome =
  | { hotspotId: string; outcome: "DROPPED"; pinId: string; spots: number }
  | { hotspotId: string; outcome: "SKIPPED" | "ENDED"; reason: string }
  | { hotspotId: string; outcome: "FAILED"; reason: string };

/** One drop's pin: the template, the title, spots at random points inside the area. */
async function placeDrop(
  ctx: ServiceCtx,
  hotspot: Prisma.HotspotGetPayload<object>,
  now: Date,
): Promise<DropOutcome> {
  try {
    const area = {
      shape: hotspot.shape as HotspotShape,
      feature: hotspot.geoJson as unknown as StoredFeature,
    };
    const { center, reach } = measureArea(area);
    const spots = generateRandomLocations(area.shape, area.feature, hotspot.spotsPerDrop);
    if (spots.length === 0)
      throw invalid("Couldn't place spots in this area. Draw it a little wider.");
    const template = templateOf(hotspot.template);
    const input: PinInput = {
      ...template,
      title: hotspot.title,
      startsAt: now,
      endsAt: new Date(now.getTime() + hotspot.pinDurationDays * DAY_MS),
      latitude: center.lat,
      longitude: center.lng,
      radiusMeters: reach,
      spotCount: spots.length,
      eventId: null,
    };
    const { pinId } = await createPin(ctx, { id: hotspot.artistId }, input, now, {
      hotspotId: hotspot.id,
      spots,
      maxRadius: MAX_AREA_METERS,
    });
    await ctx.db.hotspot.update({ where: { id: hotspot.id }, data: { lastDropAt: now } });
    return { hotspotId: hotspot.id, outcome: "DROPPED", pinId, spots: spots.length };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown error";
    console.error("[hotspot] drop failed", { hotspotId: hotspot.id, reason });
    return { hotspotId: hotspot.id, outcome: "FAILED", reason };
  }
}

/**
 * The scheduled drop for one hotspot, if it's due. Taking the slot moves
 * `nextDropAt` on only if nobody else moved it first, so two workers (or a
 * worker and the create call) can't both drop it. A drop that fails (say the
 * reward ran out) is reported and the hotspot carries on with its next slot.
 */
export async function runScheduledDrop(
  ctx: ServiceCtx,
  hotspotId: string,
  now = new Date(),
): Promise<DropOutcome> {
  const hotspot = await ctx.db.hotspot.findUnique({ where: { id: hotspotId } });
  if (!hotspot || hotspot.isHidden || !hotspot.isActive || !hotspot.nextDropAt)
    return { hotspotId, outcome: "SKIPPED", reason: "not running" };
  if (hotspot.endsAt <= now) {
    await ctx.db.hotspot.update({ where: { id: hotspot.id }, data: { nextDropAt: null } });
    return { hotspotId, outcome: "ENDED", reason: "past its end date" };
  }
  if (hotspot.nextDropAt > now) return { hotspotId, outcome: "SKIPPED", reason: "not due" };

  const { count } = await ctx.db.hotspot.updateMany({
    where: { id: hotspot.id, isActive: true, nextDropAt: hotspot.nextDropAt },
    data: { nextDropAt: nextSlot(hotspot.nextDropAt, hotspot, now) },
  });
  if (count !== 1) return { hotspotId, outcome: "SKIPPED", reason: "already dropped" };
  return placeDrop(ctx, hotspot, now);
}

/** "Drop now": an extra drop on top of the schedule, which stays as it was. */
export async function dropHotspotNow(
  ctx: ServiceCtx,
  artist: ArtistRef,
  hotspotId: string,
  now = new Date(),
) {
  const hotspot = await ownHotspot(ctx, artist, hotspotId);
  if (hotspot.endsAt <= now) throw invalid("This hotspot has ended.");
  const result = await placeDrop(ctx, hotspot, now);
  if (result.outcome === "FAILED")
    throw new AppError(ErrorCodes.VALIDATION_FAILED, { message: result.reason });
  return result;
}

/** The worker's `hotspot.drop`: every hotspot whose next drop is due. */
export async function dropDueHotspots(ctx: ServiceCtx, now = new Date()) {
  const due = await ctx.db.hotspot.findMany({
    where: { isActive: true, isHidden: false, nextDropAt: { lte: now } },
    orderBy: { nextDropAt: "asc" },
    take: 100,
    select: { id: true },
  });
  const results: DropOutcome[] = [];
  for (const { id } of due) results.push(await runScheduledDrop(ctx, id, now));
  return {
    due: due.length,
    dropped: results.filter((result) => result.outcome === "DROPPED").length,
    failed: results.filter((result) => result.outcome === "FAILED"),
  };
}
