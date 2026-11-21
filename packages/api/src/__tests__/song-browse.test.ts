import { describe, expect, it, vi } from "vitest";

import { browseSongs, songWhere } from "../services/catalog/song-browse";

const now = new Date("2026-11-15T12:00:00Z");
const price = (value: number) => ({ priceActionToken: { toNumber: () => value } });

/** A song as the ranking query sees it. */
const candidate = (id: string, over: object = {}) => ({
  id,
  title: id,
  playCount: 0,
  createdAt: new Date("2026-11-01T00:00:00Z"),
  listings: [],
  ...over,
});

/** A song as the card query returns it. */
const card = (id: string) => ({
  id,
  slug: id,
  title: id,
  type: "TRACK",
  coverUrl: `/${id}.jpg`,
  supply: null,
  playCount: 0,
  createdAt: now,
  organization: { name: "Mira", slug: "mira" },
  track: null,
  media: { mediaType: "AUDIO", durationSec: 200 },
  listings: [],
});

function setup(candidates: object[], weekly: Record<string, number> = {}) {
  const db = {
    item: {
      findMany: vi.fn(
        async (args: {
          select: { listings?: unknown; slug?: unknown };
          where: { id?: { in: string[] } };
        }) => (args.where.id?.in ? args.where.id.in.map(card) : candidates),
      ),
      count: vi.fn().mockResolvedValue(candidates.length),
    },
    playEvent: {
      groupBy: vi
        .fn()
        .mockResolvedValue(
          Object.entries(weekly).map(([itemId, count]) => ({ itemId, _count: { _all: count } })),
        ),
    },
  };
  return { ctx: { db } as never, db };
}

describe("song filters", () => {
  it("searches title and artist, and keeps to published songs", () => {
    const where = songWhere(null, { search: " gold ", show: "all" });
    expect(where).toMatchObject({
      AND: [
        { type: "TRACK", deletedAt: null, hiddenAt: null },
        {
          OR: [
            { title: { contains: "gold", mode: "insensitive" } },
            { organization: { name: { contains: "gold", mode: "insensitive" } } },
            { track: { artistName: { contains: "gold", mode: "insensitive" } } },
          ],
        },
      ],
    });
  });

  it("a price range means for sale within it", () => {
    const where = songWhere(null, { show: "all", minPrice: 5000, maxPrice: 20000 });
    expect(where?.AND).toContainEqual({
      listings: { some: { status: "ACTIVE", priceActionToken: { gte: 5000, lte: 20000 } } },
    });
  });

  it("Owned and Not owned use the viewer's holdings; Owned signed out is nothing", () => {
    const mine = { some: { userId: "fan", quantity: { gt: 0 } } };
    expect(songWhere("fan", { show: "owned" })?.AND).toContainEqual({ ownerships: mine });
    expect(songWhere("fan", { show: "notOwned" })?.AND).toContainEqual({
      NOT: { ownerships: mine },
    });
    expect(songWhere(null, { show: "owned" })).toBeNull();
  });

  it("Has stems", () => {
    expect(songWhere(null, { show: "all", stems: true })?.AND).toContainEqual({
      stems: { some: {} },
    });
  });
});

describe("browsing songs", () => {
  it("trending: this week's plays first, then all-time plays", async () => {
    const { ctx } = setup(
      [
        candidate("a", { playCount: 900 }),
        candidate("b", { playCount: 10 }),
        candidate("c", { playCount: 50 }),
      ],
      { b: 7, c: 2 },
    );
    const page = await browseSongs(ctx, null, { sort: "trending", show: "all", limit: 10 }, now);
    expect(page.tracks.map((track) => [track.id, track.playsThisWeek])).toEqual([
      ["b", 7],
      ["c", 2],
      ["a", 0],
    ]);
    expect(page.total).toBe(3);
  });

  it("played this week only: songs nobody played this week are left out, and none means none", async () => {
    const { ctx } = setup([candidate("a", { playCount: 900 }), candidate("b")], { b: 1 });
    const page = await browseSongs(
      ctx,
      null,
      { sort: "trending", show: "all", playedThisWeek: true, limit: 12 },
      now,
    );
    expect(page.tracks.map((track) => track.id)).toEqual(["b"]);

    const quiet = setup([candidate("a", { playCount: 900 })], {});
    const none = await browseSongs(
      quiet.ctx,
      null,
      { sort: "trending", show: "all", playedThisWeek: true, limit: 12 },
      now,
    );
    expect(none).toMatchObject({ tracks: [], total: 0, nextCursor: undefined });
  });

  it("price: cheapest first, songs not for sale last", async () => {
    const { ctx } = setup([
      candidate("free"),
      candidate("dear", { listings: [price(30000)] }),
      candidate("cheap", { listings: [price(800)] }),
    ]);
    const asc = await browseSongs(ctx, null, { sort: "price_asc", show: "all", limit: 10 }, now);
    expect(asc.tracks.map((track) => track.id)).toEqual(["cheap", "dear", "free"]);
    const desc = await browseSongs(ctx, null, { sort: "price_desc", show: "all", limit: 10 }, now);
    expect(desc.tracks.map((track) => track.id)).toEqual(["dear", "cheap", "free"]);
  });

  it("pages by position", async () => {
    const { ctx } = setup(
      ["a", "b", "c"].map((id, index) => candidate(id, { playCount: 10 - index })),
    );
    const first = await browseSongs(ctx, null, { sort: "trending", show: "all", limit: 2 }, now);
    expect(first.tracks.map((track) => track.id)).toEqual(["a", "b"]);
    expect(first.nextCursor).toBe(2);
    const second = await browseSongs(
      ctx,
      null,
      { sort: "trending", show: "all", limit: 2, cursor: 2 },
      now,
    );
    expect(second.tracks.map((track) => track.id)).toEqual(["c"]);
    expect(second.nextCursor).toBeUndefined();
  });

  it("newest / most played / A–Z sort in the database", async () => {
    const { ctx, db } = setup([card("a"), card("b")]);
    db.item.findMany.mockResolvedValueOnce([card("a"), card("b")] as never);
    const page = await browseSongs(ctx, null, { sort: "newest", show: "all", limit: 1 }, now);
    expect(db.item.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip: 0,
        take: 2,
      }),
    );
    expect(page.tracks.map((track) => track.id)).toEqual(["a"]);
    expect(page.nextCursor).toBe(1);
  });

  it("Owned while signed out returns nothing without asking the database", async () => {
    const { ctx, db } = setup([candidate("a")]);
    const page = await browseSongs(ctx, null, { sort: "newest", show: "owned", limit: 10 }, now);
    expect(page).toEqual({ tracks: [], nextCursor: undefined, total: 0 });
    expect(db.item.findMany).not.toHaveBeenCalled();
  });
});
