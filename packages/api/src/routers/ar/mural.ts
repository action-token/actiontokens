import { z } from "zod";

import { distanceMeters } from "@bandcoin/ar-core/ar/geo";
import { NEARBY_RADIUS_M } from "@bandcoin/ar-core/murals/constants";

import { nameMural, startScan, submitScan } from "../../services/ar/mural-scan";
import { boxAround, getMuralSettings, LIVE_MURAL, localDay, scansToday, timeZoneAt, toMuralCard } from "../../services/ar/murals";
import { authedProcedure, createRouter, publicProcedure } from "../../trpc";

const lat = z.number().min(-90).max(90);
const lng = z.number().min(-180).max(180);

/**
 * Murals fans find and scan for Mural Coins. Reads are public; scanning
 * needs a session. Admins decide on murals from the admin portal.
 *
 * Privacy: only `coverUrl` is ever shown to others; scan frames go back
 * only to the person who took them.
 */
export const muralRouter = createRouter({
  /** Murals inside the map's viewport, with the viewer's scans today. */
  inArea: publicProcedure
    .input(z.object({ north: lat, south: lat, east: lng, west: lng, includeUnverified: z.boolean().default(true) }))
    .query(async ({ ctx, input }) => {
      const settings = await getMuralSettings(ctx.db);
      const murals = await ctx.db.mural.findMany({
        where: {
          ...LIVE_MURAL,
          ...(input.includeUnverified ? {} : { status: "APPROVED" }),
          latitude: { gte: input.south, lte: input.north },
          // A box across the antimeridian skips the longitude filter rather than splitting
          longitude: input.west <= input.east ? { gte: input.west, lte: input.east } : undefined,
        },
        orderBy: { scanCount: "desc" },
        take: 300,
      });
      const today = await scansToday(ctx.db, ctx.session?.user.id, murals);
      return {
        dailyLimit: settings.dailyScansPerMural,
        murals: murals.map((mural) => ({ ...toMuralCard(mural, settings), scansToday: today.get(mural.id) ?? 0 })),
      };
    }),

  /** One mural, plus the viewer's own scans of it. */
  byId: publicProcedure.input(z.object({ id: z.string().min(1) })).query(async ({ ctx, input }) => {
    const settings = await getMuralSettings(ctx.db);
    const userId = ctx.session?.user.id;
    const mural = await ctx.db.mural.findFirst({ where: { id: input.id, mergedIntoId: null } });
    if (!mural) return null;
    // A rejected mural stays (greyed) only for people who scanned it, and never when it was fraud.
    if (mural.status === "REJECTED") {
      if (mural.rejectReason === "FRAUD" || !userId) return null;
      if (!(await ctx.db.muralScan.count({ where: { muralId: mural.id, userId } }))) return null;
    }
    if (!userId) return { mural: toMuralCard(mural, settings), mine: null };

    const scans = await ctx.db.muralScan.findMany({
      where: { muralId: mural.id, userId },
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true, coinsAwarded: true, discoveryRank: true, keyframes: true, localDay: true },
    });
    const day = localDay(timeZoneAt(mural.latitude, mural.longitude));
    return {
      mural: toMuralCard(mural, settings),
      mine: {
        scansToday: scans.filter((scan) => scan.localDay === day).length,
        dailyLimit: settings.dailyScansPerMural,
        totalScans: scans.length,
        coinsEarned: scans.reduce((sum, scan) => sum + scan.coinsAwarded, 0),
        rank: scans.find((scan) => scan.discoveryRank)?.discoveryRank ?? null,
        canName: !mural.title && scans.some((scan) => scan.discoveryRank),
        history: scans.map(({ id, createdAt, coinsAwarded, keyframes }) => ({ id, createdAt, coinsAwarded, keyframes })),
      },
    };
  }),

  /** Camera: murals close enough to pre-match against, with their reference embeddings. */
  nearby: publicProcedure.input(z.object({ lat, lng })).query(async ({ ctx, input }) => {
    const settings = await getMuralSettings(ctx.db);
    const murals = await ctx.db.mural.findMany({
      where: { ...LIVE_MURAL, ...boxAround(input.lat, input.lng, NEARBY_RADIUS_M) },
      include: { embeddings: { select: { vector: true } } },
    });
    const inRange = murals
      .map((mural) => ({ mural, distanceM: distanceMeters(input, { lat: mural.latitude, lng: mural.longitude }) }))
      .filter((row) => row.distanceM <= NEARBY_RADIUS_M)
      .sort((a, b) => a.distanceM - b.distanceM);
    const today = await scansToday(
      ctx.db,
      ctx.session?.user.id,
      inRange.map((row) => row.mural),
    );
    return {
      dailyLimit: settings.dailyScansPerMural,
      murals: inRange.map(({ mural, distanceM }) => ({
        ...toMuralCard(mural, settings),
        distanceM: Math.round(distanceM),
        scansToday: today.get(mural.id) ?? 0,
        embeddings: mural.embeddings.map((embedding) => embedding.vector),
      })),
    };
  }),

  /** Step 1 of a scan: a session and three signed keyframe uploads. */
  startScan: authedProcedure
    .input(z.object({ lat, lng, accuracy: z.number().min(0) }))
    .mutation(({ ctx, input }) => startScan(ctx.db, ctx.session.user.id, input)),

  /** Step 2: every check, then the scan, coins and mural status in one transaction. */
  submitScan: authedProcedure
    .input(
      z.object({
        sessionId: z.string().min(1),
        lat,
        lng,
        accuracy: z.number().min(0),
        mock: z.boolean().optional(),
        sweep: z.object({ spanDeg: z.number().min(0).max(360), durationMs: z.number().int().min(0) }),
        platform: z.enum(["web", "ios", "android"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      ctx.activity.set({ targetType: "MuralScanSession", targetId: input.sessionId });
      const result = await submitScan(ctx.db, ctx.session.user.id, input);
      if (result.kind !== "rejected") ctx.activity.set({ targetType: "Mural", targetId: result.mural.id, amount: String(result.coins) });
      return result;
    }),

  /** The first finders may name a mural; the first one to do it wins. */
  name: authedProcedure
    .input(z.object({ muralId: z.string().min(1), title: z.string().trim().min(2).max(80), artist: z.string().trim().max(80).optional() }))
    .mutation(({ ctx, input }) => {
      ctx.activity.set({ targetType: "Mural", targetId: input.muralId });
      return nameMural(ctx.db, ctx.session.user.id, input);
    }),

  /** Collection > Murals: one card per mural the viewer has scanned. */
  mine: authedProcedure
    .input(z.object({ cursor: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(48).default(24) }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const settings = await getMuralSettings(ctx.db);
      const groups = await ctx.db.muralScan.groupBy({
        by: ["muralId"],
        where: { userId, mural: { mergedIntoId: null, OR: [{ rejectReason: null }, { rejectReason: { not: "FRAUD" } }] } },
        _count: { _all: true },
        _sum: { coinsAwarded: true },
        _max: { createdAt: true },
        _min: { discoveryRank: true },
        orderBy: { _max: { createdAt: "desc" } },
      });
      const page = groups.slice(input.cursor, input.cursor + input.limit);
      const ids = page.map((group) => group.muralId);
      const [murals, latest] = await Promise.all([
        ctx.db.mural.findMany({ where: { id: { in: ids } } }),
        ctx.db.muralScan.findMany({
          where: { userId, muralId: { in: ids } },
          orderBy: { createdAt: "desc" },
          distinct: ["muralId"],
          select: { muralId: true, keyframes: true },
        }),
      ]);
      const byId = new Map(murals.map((mural) => [mural.id, mural]));
      const photo = new Map(latest.map((scan) => [scan.muralId, scan.keyframes[1] ?? scan.keyframes[0]]));
      const next = input.cursor + page.length;
      return {
        total: groups.length,
        nextCursor: next < groups.length ? next : null,
        items: page.flatMap((group) => {
          const mural = byId.get(group.muralId);
          if (!mural) return [];
          return [
            {
              ...toMuralCard(mural, settings),
              /** The viewer's own photo, never someone else's. */
              myPhotoUrl: photo.get(mural.id) ?? mural.coverUrl,
              myScans: group._count._all,
              coinsEarned: group._sum.coinsAwarded ?? 0,
              rank: group._min.discoveryRank,
              lastScannedAt: group._max.createdAt,
            },
          ];
        }),
      };
    }),
});
