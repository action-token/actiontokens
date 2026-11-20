import { describe, expect, it, vi } from "vitest";

import type { Db } from "@actiontokens/db";

import {
  checkEmbed,
  createEmbed,
  duplicateEmbed,
  embedStats,
  listEmbeds,
  removeEmbed,
  setEmbedEnabled,
  updateEmbed,
  type EmbedInput,
} from "../services/artist/embeds";

type Row = Record<string, unknown>;

const artist = { id: "a1" };

const base: EmbedInput = {
  name: " Tour map ",
  isEnabled: true,
  centerLat: 23.78,
  centerLng: 90.4,
  zoom: 11,
  showUserLocation: false,
  gestureMode: "COOPERATIVE",
  theme: "AUTO",
  accentColor: "#dbdc2c",
  pinSource: "ARTIST",
  pinTypes: [],
  showFilterChips: false,
  showSearch: true,
  showNearby: true,
  showMurals: true,
  eventsLabel: "Find events",
  eventsUrl: null,
  bountiesLabel: "View bounties",
  bountiesUrl: null,
  allowedDomains: [],
};

function setup(over: { embed?: Row | null; stats?: Row[] } = {}) {
  const created: Row[] = [];
  const updated: Row[] = [];
  const db = {
    mapEmbed: {
      findFirst: vi.fn().mockResolvedValue(
        over.embed === undefined
          ? {
              id: "e1",
              artistId: "a1",
              createdAt: new Date(),
              updatedAt: new Date(),
              ...base,
              name: "Tour map",
            }
          : over.embed,
      ),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn((args: { data: Row }) => {
        created.push(args.data);
        return Promise.resolve({ id: "e2" });
      }),
      update: vi.fn((args: { data: Row }) => {
        updated.push(args.data);
        return Promise.resolve({});
      }),
      delete: vi.fn().mockResolvedValue({}),
    },
    mapEmbedDailyStat: { findMany: vi.fn().mockResolvedValue(over.stats ?? []) },
  };
  const activity = { set: vi.fn() };
  return { ctx: { db: db as unknown as Db, activity } as never, db, activity, created, updated };
}

describe("checkEmbed", () => {
  it("trims the name and keeps good settings", () => {
    expect(checkEmbed(base).name).toBe("Tour map");
  });

  it("refuses an empty name, a bad colour and an out-of-range view", () => {
    expect(() => checkEmbed({ ...base, name: "  " })).toThrow(/Name the map/);
    expect(() => checkEmbed({ ...base, accentColor: "yellow" })).toThrow(/accent colour/);
    expect(() => checkEmbed({ ...base, centerLat: 90 })).toThrow(/Latitude/);
    expect(() => checkEmbed({ ...base, centerLng: 181 })).toThrow(/Longitude/);
    expect(() => checkEmbed({ ...base, zoom: 1 })).toThrow(/Zoom/);
  });

  it("cleans the allowed websites: hostnames, no duplicates, no blanks", () => {
    const out = checkEmbed({
      ...base,
      allowedDomains: ["https://www.Example.com/path", "example.com", "  ", "band.example.org"],
    });
    expect(out.allowedDomains).toEqual(["example.com", "band.example.org"]);
  });

  it("refuses something that is not a website", () => {
    expect(() => checkEmbed({ ...base, allowedDomains: ["not a site"] })).toThrow(
      /isn't a website address/,
    );
  });

  it("only lets the buttons point at web addresses", () => {
    expect(() => checkEmbed({ ...base, eventsUrl: "javascript:alert(1)" })).toThrow(/web address/);
    expect(
      checkEmbed({ ...base, bountiesUrl: " https://band.example/bounties " }).bountiesUrl,
    ).toBe("https://band.example/bounties");
    expect(checkEmbed({ ...base, eventsUrl: "   " }).eventsUrl).toBeNull();
  });

  it("drops repeated pin types", () => {
    expect(checkEmbed({ ...base, pinTypes: ["EVENT", "EVENT", "BOUNTY"] }).pinTypes).toEqual([
      "EVENT",
      "BOUNTY",
    ]);
  });
});

describe("embeds", () => {
  it("creates a map for the artist and logs it", async () => {
    const { ctx, created, activity } = setup();
    await expect(createEmbed(ctx, artist, base)).resolves.toEqual({ embedId: "e2" });
    expect(created[0]).toMatchObject({ artistId: "a1", name: "Tour map" });
    expect(activity.set).toHaveBeenCalledWith({ targetType: "MapEmbed", targetId: "e2" });
  });

  it("only touches the artist's own maps", async () => {
    const { ctx, db } = setup({ embed: null });
    await expect(updateEmbed(ctx, artist, "e9", base)).rejects.toThrow(/Map not found/);
    await expect(removeEmbed(ctx, artist, "e9")).rejects.toThrow(/Map not found/);
    expect(db.mapEmbed.findFirst).toHaveBeenCalledWith({ where: { id: "e9", artistId: "a1" } });
    expect(db.mapEmbed.update).not.toHaveBeenCalled();
    expect(db.mapEmbed.delete).not.toHaveBeenCalled();
  });

  it("turns a map off and on", async () => {
    const { ctx, updated } = setup();
    await expect(setEmbedEnabled(ctx, artist, "e1", false)).resolves.toEqual({
      embedId: "e1",
      isEnabled: false,
    });
    expect(updated[0]).toEqual({ isEnabled: false });
  });

  it("duplicates with a new name and without ids or dates", async () => {
    const { ctx, created } = setup();
    await duplicateEmbed(ctx, artist, "e1");
    expect(created[0]).toMatchObject({ name: "Tour map (copy)", artistId: "a1" });
    expect(created[0]).not.toHaveProperty("id");
    expect(created[0]).not.toHaveProperty("createdAt");
  });

  it("adds up the last 7 and 30 days per map", async () => {
    const { ctx, db } = setup();
    const today = new Date();
    const day = (ago: number) =>
      new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - ago));
    db.mapEmbed.findMany.mockResolvedValue([
      {
        id: "e1",
        stats: [
          { day: day(1), views: 10, pinTaps: 4, openClicks: 1, eventsClicks: 0, bountiesClicks: 2 },
          { day: day(20), views: 5, pinTaps: 1, openClicks: 0, eventsClicks: 1, bountiesClicks: 0 },
        ],
      },
    ]);
    const [row] = await listEmbeds(ctx, artist);
    expect(row?.last7.views).toBe(10);
    expect(row?.last30).toMatchObject({
      views: 15,
      pinTaps: 5,
      eventsClicks: 1,
      bountiesClicks: 2,
    });
  });

  it("fills quiet days with zeros, oldest first", async () => {
    const now = new Date("2026-11-10T08:00:00Z");
    const { ctx } = setup({
      stats: [
        {
          day: new Date("2026-11-09T00:00:00Z"),
          views: 7,
          pinTaps: 2,
          openClicks: 1,
          eventsClicks: 0,
          bountiesClicks: 0,
        },
      ],
    });
    const rows = await embedStats(ctx, artist, "e1", 7, now);
    expect(rows).toHaveLength(7);
    expect(rows[0]?.day).toBe("2026-11-04");
    expect(rows[6]).toMatchObject({ day: "2026-11-10", views: 0 });
    expect(rows[5]).toMatchObject({ day: "2026-11-09", views: 7, pinTaps: 2 });
  });
});
