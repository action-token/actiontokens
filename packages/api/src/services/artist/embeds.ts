import type { EmbedGesture, EmbedPinSource, EmbedTheme, PinType } from "@bandcoin/db";
import { normalizeDomain } from "@bandcoin/ar-core/embed/config";
import { AppError, ErrorCodes } from "@bandcoin/errors";

import type { Context } from "../../context";
import { webLink } from "./events";
import { invalid } from "./items";

/**
 * Website maps: the pin map an artist pastes onto their own site. The map is
 * served by the AR app at /embed/[id]; this only manages the saved settings and
 * reads the daily counters the AR app writes.
 */
type ServiceCtx = Pick<Context, "db" | "activity">;
type ArtistRef = { id: string };

export const MAX_DOMAINS = 20;

export type EmbedInput = {
  name: string;
  isEnabled: boolean;
  centerLat: number;
  centerLng: number;
  zoom: number;
  showUserLocation: boolean;
  gestureMode: EmbedGesture;
  theme: EmbedTheme;
  accentColor: string;
  pinSource: EmbedPinSource;
  pinTypes: PinType[];
  showFilterChips: boolean;
  showSearch: boolean;
  showNearby: boolean;
  showMurals: boolean;
  eventsLabel: string;
  eventsUrl: string | null;
  bountiesLabel: string;
  bountiesUrl: string | null;
  allowedDomains: string[];
};

export type EmbedTotals = { views: number; pinTaps: number; openClicks: number; eventsClicks: number; bountiesClicks: number };
const ZERO: EmbedTotals = { views: 0, pinTaps: 0, openClicks: 0, eventsClicks: 0, bountiesClicks: 0 };

const utcDay = (daysAgo: number, from = new Date()) => new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() - daysAgo));

/** Checks the settings and returns them in the shape we store (links and domains cleaned). */
export function checkEmbed(input: EmbedInput): EmbedInput {
  const name = input.name.trim();
  if (name.length === 0 || name.length > 80) throw invalid("Name the map in up to 80 characters.");
  if (!(input.centerLat >= -85 && input.centerLat <= 85)) throw invalid("Latitude must be between -85 and 85.");
  if (!(input.centerLng >= -180 && input.centerLng <= 180)) throw invalid("Longitude must be between -180 and 180.");
  if (!(input.zoom >= 2 && input.zoom <= 18)) throw invalid("Zoom must be between 2 and 18.");
  if (!/^#[0-9a-f]{6}$/i.test(input.accentColor)) throw invalid("Pick an accent colour.");
  const eventsLabel = input.eventsLabel.trim();
  const bountiesLabel = input.bountiesLabel.trim();
  if (eventsLabel.length === 0 || eventsLabel.length > 40) throw invalid("Give the events button text of up to 40 characters.");
  if (bountiesLabel.length === 0 || bountiesLabel.length > 40) throw invalid("Give the bounties button text of up to 40 characters.");
  if (input.allowedDomains.length > MAX_DOMAINS) throw invalid(`Allow up to ${MAX_DOMAINS} websites.`);

  const allowedDomains: string[] = [];
  for (const raw of input.allowedDomains) {
    if (!raw.trim()) continue;
    const domain = normalizeDomain(raw);
    if (!domain) throw invalid(`"${raw.trim()}" isn't a website address.`);
    if (!allowedDomains.includes(domain)) allowedDomains.push(domain);
  }

  return {
    ...input,
    name,
    eventsLabel,
    bountiesLabel,
    eventsUrl: input.eventsUrl?.trim() ? webLink(input.eventsUrl.trim(), "The events link") : null,
    bountiesUrl: input.bountiesUrl?.trim() ? webLink(input.bountiesUrl.trim(), "The bounties link") : null,
    pinTypes: [...new Set(input.pinTypes)],
    allowedDomains,
  };
}

async function ownEmbed(ctx: ServiceCtx, artist: ArtistRef, embedId: string) {
  const row = await ctx.db.mapEmbed.findFirst({ where: { id: embedId, artistId: artist.id } });
  if (!row) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Map not found" });
  ctx.activity.set({ targetType: "MapEmbed", targetId: row.id });
  return row;
}

export async function listEmbeds(ctx: Pick<ServiceCtx, "db">, artist: ArtistRef) {
  const rows = await ctx.db.mapEmbed.findMany({
    where: { artistId: artist.id },
    orderBy: { createdAt: "desc" },
    include: { stats: { where: { day: { gte: utcDay(29) } } } },
  });
  const since7 = utcDay(6).getTime();
  return rows.map(({ stats, ...row }) => {
    const sum = (days: typeof stats) =>
      days.reduce<EmbedTotals>(
        (total, day) => ({
          views: total.views + day.views,
          pinTaps: total.pinTaps + day.pinTaps,
          openClicks: total.openClicks + day.openClicks,
          eventsClicks: total.eventsClicks + day.eventsClicks,
          bountiesClicks: total.bountiesClicks + day.bountiesClicks,
        }),
        ZERO,
      );
    return { ...row, last7: sum(stats.filter((day) => day.day.getTime() >= since7)), last30: sum(stats) };
  });
}

export async function getEmbed(ctx: Pick<ServiceCtx, "db">, artist: ArtistRef, embedId: string) {
  const row = await ctx.db.mapEmbed.findFirst({ where: { id: embedId, artistId: artist.id } });
  if (!row) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Map not found" });
  return row;
}

/** Daily counters for the last `days` UTC days, oldest first, gaps filled with zeros. */
export async function embedStats(ctx: Pick<ServiceCtx, "db">, artist: ArtistRef, embedId: string, days: number, now = new Date()) {
  await getEmbed(ctx, artist, embedId);
  const rows = await ctx.db.mapEmbedDailyStat.findMany({ where: { embedId, day: { gte: utcDay(days - 1, now) } } });
  const byDay = new Map(rows.map((row) => [row.day.toISOString().slice(0, 10), row]));
  return Array.from({ length: days }, (_, i) => {
    const day = utcDay(days - 1 - i, now).toISOString().slice(0, 10);
    const row = byDay.get(day);
    return { day, ...(row ? { views: row.views, pinTaps: row.pinTaps, openClicks: row.openClicks, eventsClicks: row.eventsClicks, bountiesClicks: row.bountiesClicks } : ZERO) };
  });
}

export async function createEmbed(ctx: ServiceCtx, artist: ArtistRef, input: EmbedInput) {
  const row = await ctx.db.mapEmbed.create({ data: { ...checkEmbed(input), artistId: artist.id }, select: { id: true } });
  ctx.activity.set({ targetType: "MapEmbed", targetId: row.id });
  return { embedId: row.id };
}

export async function updateEmbed(ctx: ServiceCtx, artist: ArtistRef, embedId: string, input: EmbedInput) {
  const embed = await ownEmbed(ctx, artist, embedId);
  await ctx.db.mapEmbed.update({ where: { id: embed.id }, data: checkEmbed(input) });
  return { embedId: embed.id };
}

export async function setEmbedEnabled(ctx: ServiceCtx, artist: ArtistRef, embedId: string, isEnabled: boolean) {
  const embed = await ownEmbed(ctx, artist, embedId);
  await ctx.db.mapEmbed.update({ where: { id: embed.id }, data: { isEnabled } });
  return { embedId: embed.id, isEnabled };
}

export async function duplicateEmbed(ctx: ServiceCtx, artist: ArtistRef, embedId: string) {
  const { id: _id, createdAt: _created, updatedAt: _updated, ...rest } = await ownEmbed(ctx, artist, embedId);
  const copy = await ctx.db.mapEmbed.create({ data: { ...rest, name: `${rest.name} (copy)`.slice(0, 80) }, select: { id: true } });
  ctx.activity.set({ targetType: "MapEmbed", targetId: copy.id });
  return { embedId: copy.id };
}

/** Websites using the map then show "Map unavailable"; its counters go too. To pause it instead, turn it off. */
export async function removeEmbed(ctx: ServiceCtx, artist: ArtistRef, embedId: string) {
  const embed = await ownEmbed(ctx, artist, embedId);
  await ctx.db.mapEmbed.delete({ where: { id: embed.id } });
  return { embedId: embed.id };
}
