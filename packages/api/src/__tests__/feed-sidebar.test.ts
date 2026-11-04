import { describe, expect, it, vi } from "vitest";

import { artistDirectory, suggestedArtists, upcomingEvents } from "../services/feed/sidebar";

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

describe("the artist directory", () => {
  const row = (over: object = {}) => ({
    id: "a",
    name: "DJ Tamsin",
    slug: "dj-tamsin",
    bio: "Bedroom beats",
    avatarUrl: null,
    coverUrl: "https://c/x.jpg",
    fanTokenItem: { classicToken: { code: "TAMSIN" } },
    _count: { followers: 12, posts: 3, items: 5, stories: 1 },
    followers: [],
    ...over,
  });

  it("lists approved artists, most followed first, a page at a time", async () => {
    const { ctx, db } = setup([row(), row({ id: "b", slug: "b" }), row({ id: "c", slug: "c" })]);
    const page = await artistDirectory(ctx, null, { limit: 2, sort: "popular" }, now);
    expect(db.artist.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: "APPROVED" },
        orderBy: [{ followers: { _count: "desc" } }, { createdAt: "desc" }, { id: "desc" }],
        take: 3,
      }),
    );
    expect(page.artists).toHaveLength(2);
    expect(page.next).toBe("b");
    expect(page.artists[0]).toEqual({
      name: "DJ Tamsin",
      slug: "dj-tamsin",
      bio: "Bedroom beats",
      avatarUrl: null,
      coverUrl: "https://c/x.jpg",
      tokenCode: "TAMSIN",
      followers: 12,
      posts: 3,
      songs: 5,
      liveStories: 1,
      following: false,
    });
  });

  it("searches by name, orders the newest first, and starts after a cursor", async () => {
    const { ctx, db } = setup([]);
    await artistDirectory(
      ctx,
      "fan",
      { limit: 24, sort: "newest", search: "  tam ", cursor: "b" },
      now,
    );
    expect(db.artist.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: "APPROVED", name: { contains: "tam", mode: "insensitive" } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        cursor: { id: "b" },
        skip: 1,
      }),
    );
  });

  it("counts only stories that are live now, and marks the ones the viewer follows", async () => {
    const { ctx, db } = setup([row({ followers: [{ userId: "fan" }] })]);
    const page = await artistDirectory(ctx, "fan", { limit: 24, sort: "popular" }, now);
    expect(page.artists[0]!.following).toBe(true);
    const select = db.artist.findMany.mock.calls[0]![0].select;
    expect(select._count.select.stories).toEqual({
      where: { removedAt: null, expiresAt: { gt: now } },
    });
  });
});
