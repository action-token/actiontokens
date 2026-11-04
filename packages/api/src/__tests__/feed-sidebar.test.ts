import { describe, expect, it, vi } from "vitest";

import { suggestedArtists, upcomingEvents } from "../services/feed/sidebar";

const now = new Date("2026-11-05T12:00:00Z");

function setup(artists: object[] = [], events: object[] = []) {
  const db = {
    artist: { findMany: vi.fn().mockResolvedValue(artists) },
    event: { findMany: vi.fn().mockResolvedValue(events) },
  };
  return { ctx: { db } as never, db };
}

const artistRow = (over: object = {}) => ({
  name: "DJ Tamsin",
  slug: "dj-tamsin",
  avatarUrl: null,
  _count: { followers: 12, posts: 3 },
  followers: [],
  ...over,
});

describe("artists to follow", () => {
  it("lists approved artists by followers for anyone, signed in or not", async () => {
    const { ctx, db } = setup([artistRow()]);
    const list = await suggestedArtists(ctx, null, { limit: 6 });
    expect(db.artist.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: "APPROVED" },
        orderBy: [{ followers: { _count: "desc" } }, { createdAt: "desc" }],
        take: 6,
      }),
    );
    expect(list).toEqual([
      {
        name: "DJ Tamsin",
        slug: "dj-tamsin",
        avatarUrl: null,
        followers: 12,
        posts: 3,
        following: false,
      },
    ]);
  });

  it("marks the ones the viewer follows", async () => {
    const { ctx } = setup([artistRow({ followers: [{ userId: "fan" }] })]);
    expect((await suggestedArtists(ctx, "fan", { limit: 6 }))[0]!.following).toBe(true);
  });

  it("can leave out the viewer's own artist and the ones they already follow", async () => {
    const { ctx, db } = setup([]);
    await suggestedArtists(ctx, "fan", { limit: 5, excludeFollowed: true });
    expect(db.artist.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: "APPROVED",
          userId: { not: "fan" },
          followers: { none: { userId: "fan" } },
        },
      }),
    );
  });
});

describe("upcoming events", () => {
  it("lists what hasn't ended yet, soonest first, from approved artists", async () => {
    const event = {
      id: "e1",
      title: "Secret show",
      coverUrl: null,
      startsAt: new Date("2026-11-08T18:00:00Z"),
      endsAt: new Date("2026-11-08T21:00:00Z"),
      venueName: "The fountain",
      artist: { name: "DJ Tamsin", slug: "dj-tamsin", avatarUrl: null },
    };
    const { ctx, db } = setup([], [event]);
    expect(await upcomingEvents(ctx, { limit: 4 }, now)).toEqual([event]);
    expect(db.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { endsAt: { gte: now }, artist: { status: "APPROVED" } },
        orderBy: { startsAt: "asc" },
        take: 4,
      }),
    );
  });
});
