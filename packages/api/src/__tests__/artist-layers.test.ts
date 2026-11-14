import { describe, expect, it, vi } from "vitest";

import { MAX_LAYERS_PER_ARTIST } from "@bandcoin/ar-core/layers";
import { circleAround } from "@bandcoin/geo/map-geometry";

import { layerFilterWhere, mapLayerChips } from "../services/ar/pins";
import { updateHotspot, runScheduledDrop } from "../services/artist/hotspots";
import {
  checkLayer,
  createLayer,
  deleteLayer,
  listLayers,
  updateLayer,
} from "../services/artist/layers";

const now = new Date("2026-11-13T10:00:00Z");
const DAY = 86_400_000;
const artist = { id: "a1" };
const venue = { name: "Venue", icon: "Music", color: "#E5484D" };

function setup(
  opts: { have?: number; layers?: Record<string, string>; hotspotLayer?: string | null } = {},
) {
  const owners = opts.layers ?? { L1: "a1", LX: "someone-else" };
  const pins: { data: Record<string, unknown> }[] = [];
  const hotspot = {
    id: "h1",
    artistId: "a1",
    title: "Drops",
    layerId: opts.hotspotLayer ?? null,
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
  };
  const db = {
    pinLayer: {
      count: vi.fn().mockResolvedValue(opts.have ?? 0),
      create: vi.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: "L-new", ...data }),
      ),
      findFirst: vi.fn(({ where }: { where: { id: string; artistId: string } }) =>
        Promise.resolve(owners[where.id] === where.artistId ? { id: where.id } : null),
      ),
      findUnique: vi.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(where.id in owners ? { artistId: owners[where.id] } : null),
      ),
      update: vi.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: "L1", ...data }),
      ),
      delete: vi.fn().mockResolvedValue({}),
      findMany: vi
        .fn()
        .mockResolvedValue([{ id: "L1", ...venue, _count: { pins: 3, hotspots: 1 } }]),
    },
    hotspot: {
      findFirst: vi.fn().mockResolvedValue(hotspot),
      findUnique: vi.fn().mockResolvedValue(hotspot),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    pin: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
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
  const ctx = { db, activity: { set: vi.fn(), facts: vi.fn() } } as never;
  return { ctx, db, pins };
}

describe("artist layers", () => {
  it("makes, renames and deletes a layer, each logged", async () => {
    const { ctx, db } = setup();
    await createLayer(ctx, artist, { ...venue, name: "  Venue " });
    expect(db.pinLayer.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { ...venue, artistId: "a1" } }),
    );
    await updateLayer(ctx, artist, { id: "L1", ...venue, name: "Merch", color: "#0090FF" });
    expect(db.pinLayer.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { name: "Merch", icon: "Music", color: "#0090FF" } }),
    );
    await deleteLayer(ctx, artist, "L1");
    expect(db.pinLayer.delete).toHaveBeenCalledWith({ where: { id: "L1" } });
    expect((ctx as unknown as { activity: { set: unknown } }).activity.set).toHaveBeenCalledTimes(
      3,
    );
  });

  it("stops at the limit", async () => {
    const { ctx, db } = setup({ have: MAX_LAYERS_PER_ARTIST });
    await expect(createLayer(ctx, artist, venue)).rejects.toThrow(/up to 30 layers/);
    expect(db.pinLayer.create).not.toHaveBeenCalled();
  });

  it("refuses a bad name, icon or colour", async () => {
    const { ctx } = setup();
    await expect(createLayer(ctx, artist, { ...venue, name: "x" })).rejects.toThrow(/name/);
    await expect(createLayer(ctx, artist, { ...venue, icon: "Nope" })).rejects.toThrow(/icon/);
    await expect(createLayer(ctx, artist, { ...venue, color: "red" })).rejects.toThrow(/colour/);
  });

  it("only touches the artist's own layers", async () => {
    const { ctx } = setup();
    await expect(updateLayer(ctx, artist, { id: "LX", ...venue })).rejects.toThrow(/not found/i);
    await expect(deleteLayer(ctx, artist, "LX")).rejects.toThrow(/not found/i);
  });

  it("lists layers with how many pins and hotspots are in each", async () => {
    expect(await listLayers(setup().ctx, artist)).toEqual([
      { id: "L1", ...venue, pins: 3, hotspots: 1 },
    ]);
  });

  it("checks a layer: left out, none, own, someone else's, or the one already held", async () => {
    const { db } = setup();
    expect(await checkLayer(db as never, "a1", undefined)).toBeUndefined();
    expect(await checkLayer(db as never, "a1", null)).toBeNull();
    expect(await checkLayer(db as never, "a1", "L1")).toBe("L1");
    await expect(checkLayer(db as never, "a1", "LX")).rejects.toThrow(/isn't one of yours/);
    await expect(checkLayer(db as never, "a1", "gone")).rejects.toThrow(/isn't one of yours/);
    // Already held: no lookup.
    db.pinLayer.findUnique.mockClear();
    expect(await checkLayer(db as never, "a1", "LX", "LX")).toBe("LX");
    expect(db.pinLayer.findUnique).not.toHaveBeenCalled();
  });
});

describe("hotspot layers", () => {
  it("changing a hotspot's layer moves the drops it already made", async () => {
    const { ctx, db } = setup();
    await updateHotspot(ctx, artist, { hotspotId: "h1", layerId: "L1" }, now);
    expect(db.hotspot.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ layerId: "L1" }) }),
    );
    expect(db.pin.updateMany).toHaveBeenCalledWith({
      where: { hotspotId: "h1" },
      data: { layerId: "L1" },
    });
  });

  it("leaves the drops alone when the layer isn't touched", async () => {
    const { ctx, db } = setup({ hotspotLayer: "L1" });
    await updateHotspot(ctx, artist, { hotspotId: "h1", title: "New name" }, now);
    expect(db.pin.updateMany).not.toHaveBeenCalled();
  });

  it("refuses another artist's layer", async () => {
    const { ctx, db } = setup();
    await expect(
      updateHotspot(ctx, artist, { hotspotId: "h1", layerId: "LX" }, now),
    ).rejects.toThrow(/isn't one of yours/);
    expect(db.hotspot.update).not.toHaveBeenCalled();
  });

  it("each later drop goes in the hotspot's layer", async () => {
    const { ctx, pins } = setup({ hotspotLayer: "L1" });
    const result = await runScheduledDrop(ctx, "h1", now);
    expect(result.outcome).toBe("DROPPED");
    expect(pins[0]?.data.layerId).toBe("L1");
  });
});

describe("the fan map's layer filter", () => {
  it("is no filter, regular only, or the layers named", () => {
    expect(layerFilterWhere(undefined)).toEqual({});
    expect(layerFilterWhere("none")).toEqual({ layerId: null });
    expect(layerFilterWhere("a")).toEqual({ layerId: { in: ["a"] } });
    expect(layerFilterWhere("a, b,,c")).toEqual({ layerId: { in: ["a", "b", "c"] } });
    expect(layerFilterWhere(",")).toEqual({ layerId: null });
  });

  it("lists only layers with live drops, with the artist and the count, by name then artist", async () => {
    const db = {
      pin: {
        groupBy: vi.fn().mockResolvedValue([
          { layerId: "L2", _count: { _all: 2 } },
          { layerId: "L1", _count: { _all: 5 } },
        ]),
      },
      pinLayer: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "L2",
            name: "Venue",
            icon: "Music",
            color: "#111111",
            artist: { name: "Beta", avatarUrl: null },
          },
          {
            id: "L1",
            name: "Venue",
            icon: "Music",
            color: "#222222",
            artist: { name: "Acme", avatarUrl: "a.png" },
          },
        ]),
      },
    };
    const chips = await mapLayerChips(db as never, { approval: "APPROVED" });
    expect(db.pin.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { approval: "APPROVED", layerId: { not: null } } }),
    );
    expect(chips.map((chip) => [chip.id, chip.artist, chip.pinCount])).toEqual([
      ["L1", "Acme", 5],
      ["L2", "Beta", 2],
    ]);
    db.pin.groupBy.mockResolvedValue([]);
    expect(await mapLayerChips(db as never, {})).toEqual([]);
  });
});
