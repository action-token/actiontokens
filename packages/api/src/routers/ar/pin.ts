import { z } from "zod";

import { AR_CAPTURE_RADIUS, distanceMeters } from "@bandcoin/ar-core/ar/geo";
import { pinStatus, RARITY_ORDER } from "@bandcoin/ar-core/ar/rarity";
import type { ArPin, Rarity } from "@bandcoin/ar-core/ar/types";
import { PinType, type Prisma } from "@bandcoin/db";
import { AppError, ErrorCodes } from "@bandcoin/errors";

import {
  assertCollectable,
  boundingBox,
  GEOFENCE_SLACK_M,
  livePinWhere,
  loadViewer,
  pinInclude,
  searchScore,
  spotsOf,
  toArPin,
  writeCollect,
} from "../../services/ar/pins";
import { authedProcedure, createRouter, publicProcedure } from "../../trpc";

const lat = z.number().min(-90).max(90);
const lng = z.number().min(-180).max(180);

export const pinRouter = createRouter({
  /**
   * Every live pin, one entry per spot, for the map and the AR scene. Locked
   * pins are included (with why), so fans can see what following an artist
   * or joining a tier would open up. An optional circle limits the area.
   */
  list: publicProcedure
    .input(
      z
        .object({
          lat: lat.optional(),
          lng: lng.optional(),
          radiusKm: z.number().positive().max(2000).optional(),
          /** Only these pin types (website embeds); empty = all */
          types: z.array(z.enum(PinType)).max(6).optional(),
          artistId: z.string().min(1).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }): Promise<ArPin[]> => {
      const viewerId = ctx.session?.user.id ?? null;
      const area =
        input?.lat != null && input.lng != null && input.radiusKm != null
          ? { lat: input.lat, lng: input.lng, radiusKm: input.radiusKm }
          : null;
      const spotWhere = { isHidden: false, ...(area ? boundingBox(area) : {}) } satisfies Prisma.PinSpotWhereInput;
      const include = pinInclude(viewerId);

      const pins = await ctx.db.pin.findMany({
        where: {
          ...livePinWhere(viewerId),
          ...(input?.types?.length ? { type: { in: input.types } } : {}),
          ...(input?.artistId ? { artistId: input.artistId } : {}),
          spots: { some: spotWhere },
        },
        include: { ...include, spots: { ...include.spots, where: spotWhere } },
      });
      const viewer = await loadViewer(ctx, pins);
      const spots = pins.flatMap((pin) => spotsOf(pin, viewer));
      return area ? spots.filter((spot) => distanceMeters(area, spot) <= area.radiusKm * 1000) : spots;
    }),

  /**
   * Find live pins anywhere by title, artist, description or tag. Every word
   * must match; results are ranked by how well, one per pin (its nearest spot
   * to lat/lng when given).
   */
  search: publicProcedure
    .input(
      z.object({
        q: z.string().trim().min(2).max(80),
        lat: lat.optional(),
        lng: lng.optional(),
        limit: z.number().int().min(1).max(30).default(20),
        artistId: z.string().min(1).optional(),
      }),
    )
    .query(async ({ ctx, input }): Promise<ArPin[]> => {
      const viewerId = ctx.session?.user.id ?? null;
      const phrase = input.q.toLowerCase().replace(/\s+/g, " ");
      const terms = [...new Set(phrase.split(" ").filter(Boolean))].slice(0, 6);
      const contains = (term: string) => ({ contains: term, mode: "insensitive" as const });

      const pins = await ctx.db.pin.findMany({
        where: {
          ...livePinWhere(viewerId),
          ...(input.artistId ? { artistId: input.artistId } : {}),
          spots: { some: { isHidden: false } },
          AND: terms.map((term) => ({
            OR: [
              { title: contains(term) },
              { description: contains(term) },
              { artist: { name: contains(term) } },
              { tags: { some: { tag: { label: contains(term) } } } },
            ],
          })),
        },
        include: pinInclude(viewerId),
        orderBy: { createdAt: "desc" },
        take: 150,
      });

      const ranked = pins
        .map((pin) => ({
          pin,
          score: searchScore({ ...pin, artistName: pin.artist.name }, pin.tags.map((link) => link.tag.label), terms, phrase),
        }))
        .sort((a, b) => b.score - a.score || a.pin.title.localeCompare(b.pin.title))
        .slice(0, input.limit);
      if (ranked.length === 0) return [];

      const viewer = await loadViewer(ctx, ranked.map(({ pin }) => pin));
      const from = input.lat != null && input.lng != null ? { lat: input.lat, lng: input.lng } : null;
      return ranked.flatMap(({ pin }) => {
        const spots = spotsOf(pin, viewer);
        if (!from) return spots.slice(0, 1);
        const nearest = spots.reduce<ArPin | null>(
          (best, spot) => (!best || distanceMeters(from, spot) < distanceMeters(from, best) ? spot : best),
          null,
        );
        return nearest ? [nearest] : [];
      });
    }),

  /**
   * One spot, for a card page or a shared link. Ended and fully collected
   * pins still resolve, because a card you own must keep opening.
   */
  byId: publicProcedure.input(z.object({ id: z.string().min(1) })).query(async ({ ctx, input }): Promise<ArPin> => {
    const viewerId = ctx.session?.user.id ?? null;
    const spot = await ctx.db.pinSpot.findUnique({ where: { id: input.id }, select: { pinId: true } });
    const pin = spot
      ? await ctx.db.pin.findFirst({
          where: {
            id: spot.pinId,
            approval: "APPROVED",
            OR: [{ restrictedToUserId: null }, ...(viewerId ? [{ restrictedToUserId: viewerId }] : [])],
          },
          include: pinInclude(viewerId),
        })
      : null;
    const found = pin && spotsOf(pin, await loadViewer(ctx, [pin])).find((one) => one.id === input.id);
    if (!found) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "This pin doesn't exist." });
    return found;
  }),

  /**
   * One artist's pins a page at a time: live ones you can still collect, or
   * the ones you hold. Paged after building, because "collectible" depends on
   * locks the database can't filter on.
   */
  byArtist: publicProcedure
    .input(
      z.object({
        artistId: z.string().min(1),
        tab: z.enum(["live", "yours"]).default("live"),
        limit: z.number().int().min(1).max(48).default(24),
        cursor: z.number().int().min(0).nullish(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const viewerId = ctx.session?.user.id ?? null;
      const offset = input.cursor ?? 0;
      if (input.tab === "yours" && !viewerId) return { pins: [] as ArPin[], total: 0, nextCursor: null };

      const pins = await ctx.db.pin.findMany({
        where: {
          ...livePinWhere(viewerId),
          artistId: input.artistId,
          spots: {
            some: input.tab === "yours" ? { isHidden: false, claims: { some: { userId: viewerId! } } } : { isHidden: false },
          },
        },
        include: pinInclude(viewerId),
        // Stable, so a page boundary can't repeat or skip a pin
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      });
      const viewer = await loadViewer(ctx, pins);
      const matching = pins
        .flatMap((pin) => spotsOf(pin, viewer))
        .filter((pin) => (input.tab === "yours" ? pin.collected : pinStatus(pin) === "collectible"));
      const page = matching.slice(offset, offset + input.limit);
      const next = offset + page.length;
      return { pins: page, total: matching.length, nextCursor: next < matching.length ? next : null };
    }),

  /**
   * The viewer's own collection, one card per collect. Built from their
   * claims, so cards stay after a pin ends. Rarity isn't a column, so
   * filtering and sorting happen here over the fan's own claims.
   */
  collected: authedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(48).default(24),
        cursor: z.number().int().min(0).nullish(),
        rarity: z.enum(["all", "common", "rare", "epic", "legendary", "mythic"]).default("all"),
        query: z.string().max(120).default(""),
        sort: z.enum(["newest", "rarest", "artist"]).default("newest"),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const offset = input.cursor ?? 0;
      const claims = await ctx.db.pinClaim.findMany({
        where: { userId, isHidden: false },
        include: { spot: { include: { pin: { include: pinInclude(userId) } } } },
      });

      const all = claims.map((claim) => toArPin(claim.spot.pin, claim.spot, claim, null));
      // Facets cover the whole collection, so a chip can say "you own none of these".
      const counts = Object.fromEntries(RARITY_ORDER.map((rarity) => [rarity, 0])) as Record<Rarity, number>;
      for (const pin of all) counts[pin.rarity] += 1;
      const facets = {
        total: all.length,
        artists: new Set(all.map((pin) => pin.artistId)).size,
        best: all.reduce<Rarity>(
          (best, pin) => (RARITY_ORDER.indexOf(pin.rarity) > RARITY_ORDER.indexOf(best) ? pin.rarity : best),
          "common",
        ),
        counts,
      };

      const q = input.query.trim().toLowerCase();
      const matching = all
        .filter((pin) => input.rarity === "all" || pin.rarity === input.rarity)
        .filter((pin) => !q || [pin.title, pin.artistName, pin.description].some((text) => text.toLowerCase().includes(q)))
        .sort((a, b) => {
          if (input.sort === "rarest") return RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity);
          if (input.sort === "artist") return a.artistName.localeCompare(b.artistName);
          return Date.parse(b.collectedAt ?? "0") - Date.parse(a.collectedAt ?? "0");
        });
      const pins = matching.slice(offset, offset + input.limit);
      const next = offset + pins.length;
      return { pins, total: matching.length, nextCursor: next < matching.length ? next : null, facets };
    }),

  /**
   * Collect a spot by standing near it. The server checks the distance too,
   * so the API can't be used to collect from across town.
   */
  collect: authedProcedure
    .input(z.object({ spotId: z.string().min(1), lat, lng }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const { spot, pin } = await assertCollectable(ctx, userId, input.spotId);
      ctx.activity.set({ targetType: "Pin", targetId: pin.id });
      const distance = distanceMeters(input, { lat: spot.latitude, lng: spot.longitude });
      if (distance > AR_CAPTURE_RADIUS + GEOFENCE_SLACK_M) {
        throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, {
          message: `You're ${Math.round(distance)} m away. Get within ${AR_CAPTURE_RADIUS} m to collect this.`,
        });
      }
      return writeCollect(ctx.db, userId, spot, pin);
    }),

  /**
   * Collect by scanning the pin's printed QR code: holding the code stands in
   * for GPS (indoors, basements). Anyone with the code can use it; a pin that
   * must resist that needs per-scan tokens, not a static QR.
   */
  collectByQr: authedProcedure.input(z.object({ spotId: z.string().min(1) })).mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;
    const { spot, pin } = await assertCollectable(ctx, userId, input.spotId);
    ctx.activity.set({ targetType: "Pin", targetId: pin.id });
    return writeCollect(ctx.db, userId, spot, pin);
  }),
});
