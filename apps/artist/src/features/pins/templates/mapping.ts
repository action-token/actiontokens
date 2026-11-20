import {
  datesFromDays,
  datesFromMinutes,
  daysBetween,
  minutesBetween,
  type HotspotTemplateData,
  type PinTemplateData,
} from "@actiontokens/ar-core/pin-template";

import type { DrawnArea } from "../../hotspots/area-draw";
import type { PinLookValue } from "../look/look-value";
import { toLookValue } from "../look/look-value";
import type { RewardState } from "../pin-reward-fields";

/**
 * Pin templates, form side (plan 43): what a pin or hotspot form saves into a template, and what
 * a template fills a form with. Dates become durations on the way in and dates again on the way
 * out, so a template never goes stale. Pure, so the forms stay thin and this is tested.
 */

/** The details both forms share. */
type Shared = {
  title: string;
  description: string;
  imageUrl: string | null;
  link: string;
  type: NonNullable<PinTemplateData["type"]>;
  visibility: NonNullable<PinTemplateData["visibility"]>;
  tierId: string;
  reward: RewardState;
  autoCollect: boolean;
  isMultiSpot: boolean;
  tags: string[];
  look: PinLookValue;
};

export type PinFormValues = Shared & {
  radius: string;
  spotCount: string;
  start: Date | null;
  end: Date | null;
  point: { lat: number; lng: number } | null;
};

export type HotspotFormValues = Shared & {
  every: string;
  lasts: string;
  spots: string;
  start: Date | null;
  end: Date | null;
  area: DrawnArea | null;
};

const num = (value: string) => {
  const n = Number(value);
  return Number.isFinite(n) && value.trim() !== "" ? n : undefined;
};

function sharedToTemplate(v: Shared) {
  const claimLimit = num(v.reward.claimLimit);
  return {
    title: v.title.trim() || undefined,
    description: v.description.trim() || undefined,
    imageUrl: v.imageUrl ?? undefined,
    link: v.link.trim() || undefined,
    type: v.type,
    visibility: v.visibility,
    tierId: v.visibility === "TIER" && v.tierId ? v.tierId : undefined,
    reward:
      v.reward.kind === "ITEM" && v.reward.itemId
        ? ({ kind: "ITEM", itemId: v.reward.itemId } as const)
        : v.reward.kind === "FAN_TOKEN"
          ? ({ kind: "FAN_TOKEN", amount: v.reward.amount.trim() || undefined } as const)
          : ({ kind: "NONE" } as const),
    claimLimit: claimLimit !== undefined && claimLimit >= 0 ? Math.floor(claimLimit) : undefined,
    autoCollect: v.autoCollect,
    isMultiSpot: v.isMultiSpot,
    tags: v.tags,
    look: v.look,
  };
}

/** What a template puts into a form, only for the fields it has. */
export type SharedFill = Partial<Shared>;

function sharedFromTemplate(d: PinTemplateData | HotspotTemplateData): SharedFill {
  const fill: SharedFill = {};
  if (d.title !== undefined) fill.title = d.title;
  if (d.description !== undefined) fill.description = d.description;
  if (d.imageUrl !== undefined) fill.imageUrl = d.imageUrl;
  if (d.link !== undefined) fill.link = d.link;
  if (d.type !== undefined) fill.type = d.type;
  if (d.visibility !== undefined) fill.visibility = d.visibility;
  if (d.tierId !== undefined) fill.tierId = d.tierId;
  if (d.reward !== undefined || d.claimLimit !== undefined) {
    fill.reward = {
      kind: d.reward?.kind ?? "NONE",
      itemId: d.reward?.kind === "ITEM" ? d.reward.itemId : "",
      amount: d.reward?.kind === "FAN_TOKEN" && d.reward.amount ? d.reward.amount : "",
      claimLimit: d.claimLimit && d.claimLimit > 0 ? String(d.claimLimit) : "",
    };
  }
  if (d.autoCollect !== undefined) fill.autoCollect = d.autoCollect;
  if (d.isMultiSpot !== undefined) fill.isMultiSpot = d.isMultiSpot;
  if (d.tags !== undefined) fill.tags = d.tags;
  if (d.look !== undefined) fill.look = toLookValue(d.look);
  return fill;
}

export function pinFormToTemplate(
  v: PinFormValues,
  { includeLocation, now = new Date() }: { includeLocation: boolean; now?: Date },
): PinTemplateData {
  const radius = num(v.radius);
  const spotCount = num(v.spotCount);
  const data: PinTemplateData = {
    ...sharedToTemplate(v),
    radiusMeters: radius !== undefined && radius >= 0 ? radius : undefined,
    spotCount: spotCount !== undefined && spotCount >= 1 ? Math.floor(spotCount) : undefined,
    durationMinutes: v.end ? minutesBetween(v.start ?? now, v.end) : undefined,
    location: includeLocation && v.point ? v.point : undefined,
  };
  return stripUndefined(data);
}

export type PinTemplateFill = SharedFill & {
  radius?: string;
  spotCount?: string;
  /** The end the duration gives, counted from now (the start stays "now") */
  end?: Date;
  point?: { lat: number; lng: number };
};

export function templateToPinForm(data: PinTemplateData, now = new Date()): PinTemplateFill {
  const fill: PinTemplateFill = sharedFromTemplate(data);
  if (data.radiusMeters !== undefined) fill.radius = String(data.radiusMeters);
  if (data.spotCount !== undefined) fill.spotCount = String(data.spotCount);
  if (data.durationMinutes !== undefined)
    fill.end = datesFromMinutes(data.durationMinutes, now).end;
  if (data.location) fill.point = data.location;
  return fill;
}

export function hotspotFormToTemplate(
  v: HotspotFormValues,
  { includeArea, now = new Date() }: { includeArea: boolean; now?: Date },
): HotspotTemplateData {
  const every = num(v.every);
  const lasts = num(v.lasts);
  const spots = num(v.spots);
  const data: HotspotTemplateData = {
    ...sharedToTemplate(v),
    dropEveryDays: every !== undefined && every >= 1 ? Math.floor(every) : undefined,
    pinDurationDays: lasts !== undefined && lasts >= 1 ? Math.floor(lasts) : undefined,
    spotsPerDrop: spots !== undefined && spots >= 1 ? Math.floor(spots) : undefined,
    scheduleDays: v.end ? daysBetween(v.start ?? now, v.end) : undefined,
    area:
      includeArea && v.area ? { shape: v.area.shape, feature: v.area.feature as never } : undefined,
  };
  return stripUndefined(data);
}

export type HotspotTemplateFill = SharedFill & {
  every?: string;
  lasts?: string;
  spots?: string;
  end?: Date;
  area?: DrawnArea;
};

export function templateToHotspotForm(
  data: HotspotTemplateData,
  now = new Date(),
): HotspotTemplateFill {
  const fill: HotspotTemplateFill = sharedFromTemplate(data);
  if (data.dropEveryDays !== undefined) fill.every = String(data.dropEveryDays);
  if (data.pinDurationDays !== undefined) fill.lasts = String(data.pinDurationDays);
  if (data.spotsPerDrop !== undefined) fill.spots = String(data.spotsPerDrop);
  if (data.scheduleDays !== undefined) fill.end = datesFromDays(data.scheduleDays, now).end;
  if (data.area)
    fill.area = {
      shape: data.area.shape,
      feature: data.area.feature as unknown as DrawnArea["feature"],
    };
  return fill;
}

/** Leaves out the fields that are undefined, so a saved template holds only what was filled in. */
function stripUndefined<T extends object>(data: T): T {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)) as T;
}
