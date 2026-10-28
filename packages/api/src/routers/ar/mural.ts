import { z } from "zod";

import { getMuralSettings, LIVE_MURAL, localDay, scansToday, timeZoneAt, toMuralCard } from "../../services/ar/murals";
import { createRouter, publicProcedure } from "../../trpc";

const lat = z.number().min(-90).max(90);
const lng = z.number().min(-180).max(180);

/**
 * Murals on the map. Reads are public; only `coverUrl` is ever shown to
 * others, scan frames stay with the person who took them.
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
});
