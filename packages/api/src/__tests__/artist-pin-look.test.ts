import { describe, expect, it, vi } from "vitest";

import { circleAround } from "@bandcoin/geo/map-geometry";

import { createHotspot, runScheduledDrop, updateHotspot } from "../services/artist/hotspots";
import { copyLook, lookColumnsFor, lookData } from "../services/artist/pin-look";

const now = new Date("2026-11-13T10:00:00Z");
const DAY = 86_400_000;
const artist = { id: "a1" };

const hotspotRow = (over: Record<string, unknown> = {}) => ({
  id: "h1",
  artistId: "a1",
  title: "Drops",
  layerId: null,
  markerShape: "star",
  pinShapeId: null,
  markerFill: "PIN",
  markerColor: "#E5484D",
  markerImageFit: { zoom: 2, x: 0.5, y: 0 },
  markerAutoBadge: false,
  template: {
    type: "OTHER",
    visibility: "PUBLIC",
    reward: { kind: "NONE" },
    claimLimit: 0,
    autoCollect: false,
    isMultiSpot: false,
    tags: [],
  },
  spotsPerDrop: 2,
  lastDropAt: null,
  dropEveryDays: 2,
  pinDurationDays: 1,
  startsAt: new Date(+now - DAY),
  endsAt: new Date(+now + 10 * DAY),
  autoCollect: false,
  isMultiSpot: false,
  shape: "circle",
  geoJson: circleAround({ lat: 23.8, lng: 90.4 }, 500),
  isActive: true,
  isHidden: false,
  nextDropAt: new Date(+now - 1000),
  ...over,
});

function setup(row = hotspotRow()) {
  const pins: { data: Record<string, unknown> }[] = [];
  const db = {
    pinShape: {
      findFirst: vi.fn(({ where }: { where: { id: string; artistId: string } }) =>
        Promise.resolve(where.id === "S1" && where.artistId === "a1" ? { id: "S1" } : null),
      ),
    },
    pinLayer: { findUnique: vi.fn() },
    hotspot: {
      findFirst: vi.fn().mockResolvedValue(row),
      findUnique: vi.fn().mockResolvedValue(row),
      create: vi.fn().mockResolvedValue({ id: "h-new" }),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    pin: { updateMany: vi.fn() },
    pinTag: { upsert: vi.fn() },
    pinTagLink: { deleteMany: vi.fn(), createMany: vi.fn() },
    membershipTier: { findFirst: vi.fn() },
    $transaction: vi.fn((arg: unknown) =>
      (arg as (tx: unknown) => unknown)({
        pin: {
          create: vi.fn((args: { data: Record<string, unknown> }) => {
            pins.push(args);
            return Promise.resolve({ id: "p-new" });
          }),
        },
        pinTag: { upsert: vi.fn() },
        pinTagLink: { deleteMany: vi.fn(), createMany: vi.fn() },
      }),
    ),
  };
  return { ctx: { db, activity: { set: vi.fn(), facts: vi.fn() } } as never, db, pins };
}

describe("the look a form sends", () => {
  it("leaves the stored look alone when the form sends none", async () => {
    expect(await lookColumnsFor(setup().db as never, "a1", undefined)).toBeUndefined();
  });

  it("stores a built-in shape, and the defaults for the rest", async () => {
    expect(await lookColumnsFor(setup().db as never, "a1", { shape: "note" })).toEqual({
      markerShape: "note",
      pinShapeId: null,
      markerFill: "ARTIST",
      markerColor: null,
      markerImageFit: null,
      markerAutoBadge: true,
    });
  });

  it("stores the artist's own shape in its own column", async () => {
    expect(await lookColumnsFor(setup().db as never, "a1", { shape: "S1" })).toMatchObject({
      markerShape: null,
      pinShapeId: "S1",
    });
  });

  it("refuses someone else's shape, and a bad colour or fill", async () => {
    const { db } = setup();
    await expect(lookColumnsFor(db as never, "a1", { shape: "S-other" })).rejects.toThrow(
      /isn't available/,
    );
    await expect(lookColumnsFor(db as never, "a2", { shape: "S1" })).rejects.toThrow(
      /isn't available/,
    );
    await expect(lookColumnsFor(db as never, "a1", { color: "red" })).rejects.toThrow();
    await expect(lookColumnsFor(db as never, "a1", { fill: "LOGO" as never })).rejects.toThrow();
  });

  it("writes a missing picture fit as a database null", () => {
    expect(lookData(copyLook({})).markerImageFit).toBeDefined();
    expect(copyLook({})).toMatchObject({ markerFill: "ARTIST", markerAutoBadge: true });
  });
});

describe("a hotspot's look", () => {
  it("is stored on the hotspot", async () => {
    const { ctx, db } = setup(hotspotRow({ startsAt: new Date(+now + DAY) }));
    await createHotspot(
      ctx,
      artist,
      {
        title: "Drops",
        look: { shape: "pick", fill: "NONE", color: "#0090FF" },
        type: "OTHER",
        visibility: "PUBLIC",
        reward: { kind: "NONE" },
        claimLimit: 0,
        autoCollect: false,
        isMultiSpot: false,
        area: { shape: "circle", feature: circleAround({ lat: 23.8, lng: 90.4 }, 500) },
        dropEveryDays: 2,
        pinDurationDays: 1,
        startsAt: new Date(+now + DAY),
        endsAt: new Date(+now + 10 * DAY),
        spotsPerDrop: 2,
      },
      now,
    );
    expect(db.hotspot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          markerShape: "pick",
          markerFill: "NONE",
          markerColor: "#0090FF",
        }),
      }),
    );
  });

  it("can be changed without touching the rest", async () => {
    const { ctx, db } = setup();
    await updateHotspot(ctx, artist, { hotspotId: "h1", look: { shape: "shield" } }, now);
    expect(db.hotspot.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ markerShape: "shield" }),
      }),
    );
    db.hotspot.update.mockClear();
    await updateHotspot(ctx, artist, { hotspotId: "h1", title: "New" }, now);
    expect(db.hotspot.update.mock.calls[0]?.[0]).toMatchObject({
      data: expect.not.objectContaining({ markerShape: expect.anything() }),
    });
  });

  it("every drop gets the hotspot's look", async () => {
    const { ctx, pins } = setup();
    expect((await runScheduledDrop(ctx, "h1", now)).outcome).toBe("DROPPED");
    expect(pins[0]?.data).toMatchObject({
      markerShape: "star",
      markerFill: "PIN",
      markerColor: "#E5484D",
      markerAutoBadge: false,
    });
    expect(pins[0]?.data.markerImageFit).toEqual({ zoom: 2, x: 0.5, y: 0 });
  });
});
