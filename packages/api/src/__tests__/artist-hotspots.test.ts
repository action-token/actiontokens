import { describe, expect, it, vi } from "vitest";

import { circleAround, polygonFeature } from "@bandcoin/geo/map-geometry";

import {
  createHotspot,
  dropDueHotspots,
  hotspotStatus,
  measureArea,
  nextSlot,
  removeHotspot,
  runScheduledDrop,
  setHotspotPaused,
} from "../services/artist/hotspots";

const DAY = 86_400_000;
const now = new Date("2026-11-03T10:00:00Z");
const at = (days: number) => new Date(now.getTime() + days * DAY);
const artist = { id: "a1" };
const circle = { shape: "circle" as const, feature: circleAround({ lat: 23.8, lng: 90.4 }, 500) };

function hotspotRow(over: Record<string, unknown> = {}) {
  return {
    id: "h1",
    artistId: "a1",
    title: "Street drops",
    template: {
      type: "OTHER",
      visibility: "PUBLIC",
      reward: { kind: "NONE" },
      claimLimit: 0,
      autoCollect: false,
      isMultiSpot: false,
      tags: [],
    },
    spotsPerDrop: 3,
    lastDropAt: null,
    dropEveryDays: 2,
    pinDurationDays: 1,
    startsAt: at(-1),
    endsAt: at(10),
    autoCollect: false,
    isMultiSpot: false,
    shape: "circle",
    geoJson: circle.feature,
    isActive: true,
    isHidden: false,
    nextDropAt: at(-0.01),
    createdAt: at(-1),
    updatedAt: at(-1),
    ...over,
  };
}

function setup(row = hotspotRow(), claimed = 1) {
  const pins: unknown[] = [];
  const db = {
    hotspot: {
      findUnique: vi.fn().mockResolvedValue(row),
      findFirst: vi.fn().mockResolvedValue(row),
      findMany: vi.fn().mockResolvedValue([{ id: row.id }]),
      create: vi.fn().mockResolvedValue({ id: "h1" }),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: claimed }),
    },
    pin: {
      updateMany: vi.fn().mockResolvedValue({ count: 2 }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    pinTag: { upsert: vi.fn() },
    pinTagLink: { deleteMany: vi.fn(), createMany: vi.fn() },
    membershipTier: { findFirst: vi.fn() },
    $transaction: vi.fn((arg: unknown) =>
      typeof arg === "function"
        ? (arg as (tx: unknown) => unknown)({
            pin: {
              create: vi.fn((args: unknown) => {
                pins.push(args);
                return Promise.resolve({ id: "p-new" });
              }),
            },
            pinTag: { upsert: vi.fn() },
            pinTagLink: { deleteMany: vi.fn(), createMany: vi.fn() },
          })
        : Promise.all(arg as Promise<unknown>[]),
    ),
  };
  const ctx = { db, activity: { set: vi.fn(), facts: vi.fn() } } as never;
  return { ctx, db, pins };
}

const createdPin = (pins: unknown[]) =>
  (pins[0] as { data: Record<string, unknown> & { spots: { createMany: { data: unknown[] } } } })
    .data;

describe("hotspot timing", () => {
  it("steps to the next slot, skipping ones missed while down, and stops at the end", () => {
    const rhythm = { dropEveryDays: 2, endsAt: at(10) };
    expect(nextSlot(at(0), rhythm, at(0))).toEqual(at(2));
    expect(nextSlot(at(-5), rhythm, at(0))).toEqual(at(1));
    expect(nextSlot(at(9), rhythm, at(9))).toBeNull();
  });

  it("reads as scheduled, running, paused or ended", () => {
    expect(hotspotStatus({ isActive: true, startsAt: at(1), endsAt: at(5) }, now)).toBe(
      "SCHEDULED",
    );
    expect(hotspotStatus({ isActive: true, startsAt: at(-1), endsAt: at(5) }, now)).toBe("ACTIVE");
    expect(hotspotStatus({ isActive: false, startsAt: at(-1), endsAt: at(5) }, now)).toBe("PAUSED");
    expect(hotspotStatus({ isActive: true, startsAt: at(-5), endsAt: at(-1) }, now)).toBe("ENDED");
  });
});

describe("hotspot area", () => {
  it("measures how far a drawn area reaches", () => {
    expect(measureArea(circle).reach).toBeGreaterThanOrEqual(499);
  });

  it("refuses empty, tiny and huge areas", () => {
    const empty = {
      shape: "polygon" as const,
      feature: {
        ...polygonFeature([{ lat: 1, lng: 1 }]),
        geometry: { type: "Polygon" as const, coordinates: [] },
      },
    };
    expect(() => measureArea(empty)).toThrow(/Draw the area/);
    const tiny = {
      shape: "circle" as const,
      feature: circleAround({ lat: 23.8, lng: 90.4 }, 2),
    };
    expect(() => measureArea(tiny)).toThrow(/too small/);
    const huge = {
      shape: "circle" as const,
      feature: circleAround({ lat: 23.8, lng: 90.4 }, 80_000),
    };
    expect(() => measureArea(huge)).toThrow(/within 50 km/);
  });
});

describe("scheduled drops", () => {
  it("drops once: a pin, live without review, with spots inside the area, then moves the slot on", async () => {
    const { ctx, db, pins } = setup();
    const result = await runScheduledDrop(ctx, "h1", now);
    expect(result).toMatchObject({ outcome: "DROPPED", spots: 3 });
    expect(db.hotspot.updateMany).toHaveBeenCalledWith({
      where: { id: "h1", isActive: true, nextDropAt: at(-0.01) },
      data: { nextDropAt: expect.any(Date) },
    });
    const pin = createdPin(pins);
    expect(pin).toMatchObject({
      title: "Street drops",
      approval: "APPROVED",
      hotspotId: "h1",
      startsAt: now,
      endsAt: at(1),
    });
    expect(pin.spots.createMany.data).toHaveLength(3);
  });

  it("does nothing when another run took the slot first", async () => {
    const { ctx, pins } = setup(hotspotRow(), 0);
    expect(await runScheduledDrop(ctx, "h1", now)).toMatchObject({ outcome: "SKIPPED" });
    expect(pins).toHaveLength(0);
  });

  it("stops after the end date, and skips paused or not-yet-due hotspots", async () => {
    const ended = setup(hotspotRow({ endsAt: at(-1) }));
    expect(await runScheduledDrop(ended.ctx, "h1", now)).toMatchObject({ outcome: "ENDED" });
    expect(ended.db.hotspot.update).toHaveBeenCalledWith({
      where: { id: "h1" },
      data: { nextDropAt: null },
    });
    const paused = setup(hotspotRow({ isActive: false }));
    expect(await runScheduledDrop(paused.ctx, "h1", now)).toMatchObject({ outcome: "SKIPPED" });
    const early = setup(hotspotRow({ nextDropAt: at(1) }));
    expect(await runScheduledDrop(early.ctx, "h1", now)).toMatchObject({ outcome: "SKIPPED" });
  });

  it("reports a failed drop and carries on", async () => {
    const { ctx } = setup(hotspotRow({ title: "x" }));
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const run = await dropDueHotspots(ctx, now);
    quiet.mockRestore();
    expect(run).toMatchObject({ due: 1, dropped: 0, failed: [{ outcome: "FAILED" }] });
  });
});

describe("managing hotspots", () => {
  const input = {
    title: "Street drops",
    type: "OTHER" as const,
    visibility: "PUBLIC" as const,
    reward: { kind: "NONE" as const },
    claimLimit: 0,
    autoCollect: false,
    isMultiSpot: false,
    area: circle,
    dropEveryDays: 2,
    pinDurationDays: 1,
    spotsPerDrop: 3,
  };

  it("waits for the start date before the first drop", async () => {
    const { ctx, db, pins } = setup();
    await expect(
      createHotspot(ctx, artist, { ...input, startsAt: at(2), endsAt: at(9) }, now),
    ).resolves.toEqual({ hotspotId: "h1", dropped: false });
    expect(db.hotspot.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ nextDropAt: at(2) }) }),
    );
    expect(pins).toHaveLength(0);
  });

  it("drops right away when it starts now", async () => {
    const { ctx, pins } = setup();
    const created = await createHotspot(
      ctx,
      artist,
      { ...input, startsAt: now, endsAt: at(9) },
      now,
    );
    expect(created.dropped).toBe(true);
    expect(pins).toHaveLength(1);
  });

  it("checks the schedule and spots", async () => {
    const { ctx } = setup();
    await expect(
      createHotspot(ctx, artist, { ...input, dropEveryDays: 0, startsAt: now, endsAt: at(9) }, now),
    ).rejects.toThrow(/Drop every/);
    await expect(
      createHotspot(
        ctx,
        artist,
        { ...input, spotsPerDrop: 500, startsAt: now, endsAt: at(9) },
        now,
      ),
    ).rejects.toThrow(/between 1 and 100 spots/);
  });

  it("won't resume an ended hotspot, and remove hides it and its drops", async () => {
    const ended = setup(hotspotRow({ endsAt: at(-1), isActive: false }));
    await expect(
      setHotspotPaused(ended.ctx, artist, { hotspotId: "h1", paused: false }, now),
    ).rejects.toThrow(/has ended/);

    const { ctx, db } = setup();
    await removeHotspot(ctx, artist, "h1");
    expect(db.pin.updateMany).toHaveBeenCalledWith({
      where: { hotspotId: "h1" },
      data: { isHidden: true },
    });
    expect(db.hotspot.update).toHaveBeenCalledWith({
      where: { id: "h1" },
      data: { isHidden: true, isActive: false, nextDropAt: null },
    });
  });
});
