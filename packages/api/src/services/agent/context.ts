import type { Context } from "../../context";
import type { PinTypeName } from "./contract";

/**
 * What the agent knows about the artist before the person says anything: who
 * they are, what they already have on the map, and their usual pin settings.
 * Every query is scoped to the one artist.
 */
export type ArtistContext = {
  id: string;
  name: string;
  bio: string | null;
  counts: {
    activePins: number;
    upcomingPins: number;
    expiredPins: number;
    inReviewPins: number;
    hotspotsActive: number;
    hotspotsPaused: number;
  };
  pinTypes: Partial<Record<PinTypeName, number>>;
  recentPins: { title: string; type: PinTypeName }[];
  habits: {
    type: PinTypeName;
    durationDays: number;
    autoCollect: boolean;
    pinNumber: number;
  } | null;
};

/** A private unlock pin belongs to one token holder: the agent never lists, edits or counts it. */
export const PUBLIC_PINS = { restrictedToUserId: null } as const;

const DAY = 86_400_000;

export async function loadArtistContext(
  ctx: Pick<Context, "db">,
  organizationId: string,
  now = new Date(),
): Promise<ArtistContext> {
  const artist = await ctx.db.organization.findUnique({
    where: { id: organizationId },
    select: { name: true, bio: true },
  });
  if (!artist) throw new Error("Artist not found");
  const mine = { organizationId, isHidden: false, ...PUBLIC_PINS } as const;
  const [active, upcoming, expired, inReview, hotspotsActive, hotspotsPaused, byType, recent] =
    await Promise.all([
      ctx.db.pin.count({
        where: { ...mine, approval: "APPROVED", startsAt: { lte: now }, endsAt: { gte: now } },
      }),
      ctx.db.pin.count({ where: { ...mine, approval: "APPROVED", startsAt: { gt: now } } }),
      ctx.db.pin.count({ where: { ...mine, endsAt: { lt: now } } }),
      ctx.db.pin.count({ where: { ...mine, approval: "PENDING", endsAt: { gte: now } } }),
      ctx.db.hotspot.count({ where: { organizationId, isHidden: false, isActive: true } }),
      ctx.db.hotspot.count({ where: { organizationId, isHidden: false, isActive: false } }),
      ctx.db.pin.groupBy({
        by: ["type"],
        where: { ...mine, endsAt: { gte: now } },
        _count: { _all: true },
      }),
      ctx.db.pin.findMany({
        where: mine,
        orderBy: { createdAt: "desc" },
        take: 40,
        select: {
          title: true,
          type: true,
          startsAt: true,
          endsAt: true,
          spots: { select: { autoCollect: true } },
        },
      }),
    ]);
  return {
    id: organizationId,
    name: artist.name,
    bio: artist.bio,
    counts: {
      activePins: active,
      upcomingPins: upcoming,
      expiredPins: expired,
      inReviewPins: inReview,
      hotspotsActive,
      hotspotsPaused,
    },
    pinTypes: Object.fromEntries(byType.map((row) => [row.type, row._count._all])),
    recentPins: recent.slice(0, 6).map((p) => ({ title: p.title, type: p.type as PinTypeName })),
    habits: habitsOf(recent),
  };
}

/** The artist's usual settings, from its recent pins (null when it has none). */
function habitsOf(
  pins: { type: string; startsAt: Date; endsAt: Date; spots: { autoCollect: boolean }[] }[],
): ArtistContext["habits"] {
  if (pins.length === 0) return null;
  const most = <T>(values: T[]) => {
    const counts = new Map<T, number>();
    for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  };
  const days = pins
    .map((p) => Math.max(1, Math.round((p.endsAt.getTime() - p.startsAt.getTime()) / DAY)))
    .sort((a, b) => a - b);
  const auto = pins.flatMap((p) => p.spots.map((s) => s.autoCollect));
  return {
    type: most(pins.map((p) => p.type)) as PinTypeName,
    // Pins that last for a century mean "no end date": capped to a readable habit.
    durationDays: Math.min(days[Math.floor(days.length / 2)]!, 3650),
    autoCollect: auto.length > 0 && auto.filter(Boolean).length > auto.length / 2,
    pinNumber: Math.max(
      1,
      Math.round(pins.reduce((sum, p) => sum + p.spots.length, 0) / pins.length),
    ),
  };
}
