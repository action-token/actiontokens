import { describe, expect, it, vi } from "vitest";

import type { SessionUser } from "../context";
import {
  artistStories,
  markStoryViewed,
  STORY_KEEP_MS,
  storyArchive,
  storyRing,
  sweepStories,
} from "../services/feed/stories";

const now = new Date("2026-11-05T12:00:00Z");
const fan: SessionUser = { id: "fan", role: "FAN", walletAddress: "GFAN", walletType: "email" };
const ARTIST_USER = "artist-user";

const artistRow = {
  id: "a0",
  name: "DJ Tamsin",
  slug: "dj-tamsin",
  avatarUrl: null,
  userId: ARTIST_USER,
  fanTokenItem: { classicToken: { code: "TAMSIN", issuer: "GISSUER" } },
};

const storyRow = (over: Record<string, unknown> = {}) => ({
  id: "s1",
  type: "IMAGE",
  url: "https://cdn/s1.jpg",
  thumbnailUrl: null,
  caption: "Soundcheck",
  audience: "EVERYONE",
  tier: null,
  createdAt: new Date("2026-11-05T09:00:00Z"),
  expiresAt: new Date("2026-11-06T09:00:00Z"),
  views: [],
  ...over,
});

function setup(
  over: { artist?: object | null; stories?: object[]; follows?: boolean; held?: string } = {},
) {
  const db = {
    artist: {
      findFirst: vi.fn().mockResolvedValue(over.artist === undefined ? artistRow : over.artist),
    },
    story: {
      findMany: vi.fn().mockResolvedValue(over.stories ?? [storyRow()]),
      findFirst: vi
        .fn()
        .mockResolvedValue({ id: "s1", audience: "EVERYONE", tier: null, artist: artistRow }),
    },
    follow: {
      findFirst: vi.fn().mockResolvedValue(over.follows ? { artistId: "a0" } : null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    storyView: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  const chain = {
    loadAccount: vi.fn().mockResolvedValue({
      balances: [{ asset_code: "TAMSIN", asset_issuer: "GISSUER", balance: over.held ?? "0" }],
    }),
  };
  return { ctx: { db, chain } as never, db, chain };
}

describe("the story ring", () => {
  const ringRow = (slug: string, id: string, at: string, seen = false, artistId = slug) => ({
    id,
    createdAt: new Date(at),
    artistId,
    artist: { slug, name: slug.toUpperCase(), avatarUrl: null },
    views: seen ? [{ userId: "fan" }] : [],
  });

  it("groups live stories by artist: people you follow first, unseen before seen, then newest", async () => {
    const { ctx, db } = setup();
    db.story.findMany.mockResolvedValue([
      ringRow("seen", "s1", "2026-11-05T11:00:00Z", true),
      ringRow("fresh", "s2", "2026-11-05T08:00:00Z"),
      ringRow("fresh", "s3", "2026-11-05T09:00:00Z"),
      ringRow("followed", "s4", "2026-11-05T07:00:00Z", true),
      ringRow("newest", "s5", "2026-11-05T10:00:00Z"),
    ]);
    db.follow.findMany.mockResolvedValue([{ artistId: "followed" }]);
    const ring = await storyRing(ctx, fan, now);
    expect(ring.map((entry) => entry.slug)).toEqual(["followed", "newest", "fresh", "seen"]);
    expect(ring.find((entry) => entry.slug === "fresh")).toMatchObject({
      stories: 2,
      seen: false,
      following: false,
    });
    expect(ring.find((entry) => entry.slug === "seen")).toMatchObject({ seen: true });
    expect(db.story.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          removedAt: null,
          expiresAt: { gt: now },
          artist: { status: "APPROVED" },
        },
      }),
    );
  });

  it("works signed out: nothing is seen, nobody is followed", async () => {
    const { ctx, db } = setup();
    db.story.findMany.mockResolvedValue([ringRow("a", "s1", "2026-11-05T08:00:00Z")]);
    const ring = await storyRing(ctx, null, now);
    expect(ring).toEqual([expect.objectContaining({ slug: "a", seen: false, following: false })]);
    expect(db.follow.findMany).not.toHaveBeenCalled();
  });
});

describe("one artist's stories", () => {
  it("lists them oldest first, open to anyone for an everyone story", async () => {
    const { ctx, db } = setup();
    const result = await artistStories(ctx, null, "dj-tamsin", now);
    expect(result.artist).toEqual({ name: "DJ Tamsin", slug: "dj-tamsin", avatarUrl: null });
    expect(result.stories[0]).toMatchObject({
      id: "s1",
      url: "https://cdn/s1.jpg",
      caption: "Soundcheck",
      lock: null,
      seen: false,
    });
    expect(db.story.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { artistId: "a0", removedAt: null, expiresAt: { gt: now } },
        orderBy: { createdAt: "asc" },
      }),
    );
  });

  it("shows a lock and no media to someone who doesn't follow", async () => {
    const { ctx } = setup({ stories: [storyRow({ audience: "FOLLOWERS" })] });
    const [story] = (await artistStories(ctx, fan, "dj-tamsin", now)).stories;
    expect(story).toMatchObject({
      id: "s1",
      url: null,
      thumbnailUrl: null,
      caption: null,
      lock: { kind: "FOLLOW" },
    });
  });

  it("opens a followers' story once they follow", async () => {
    const { ctx } = setup({ stories: [storyRow({ audience: "FOLLOWERS" })], follows: true });
    const [story] = (await artistStories(ctx, fan, "dj-tamsin", now)).stories;
    expect(story).toMatchObject({ url: "https://cdn/s1.jpg", lock: null });
  });

  it("locks a members' story by the fan token held, and never reads a wallet for a signed-out viewer", async () => {
    const tier = { name: "Insider", requiredTokens: { toString: () => "50" } };
    const members = storyRow({ audience: "MEMBERS", tier });
    const short = setup({ stories: [members], held: "10" });
    const [locked] = (await artistStories(short.ctx, fan, "dj-tamsin", now)).stories;
    expect(locked).toMatchObject({
      url: null,
      lock: { kind: "TIER", tierName: "Insider", needed: "50", have: "10" },
    });

    const enough = setup({ stories: [members], held: "80" });
    expect((await artistStories(enough.ctx, fan, "dj-tamsin", now)).stories[0]!.lock).toBeNull();

    const out = setup({ stories: [members] });
    const [signedOut] = (await artistStories(out.ctx, null, "dj-tamsin", now)).stories;
    expect(signedOut).toMatchObject({ url: null, lock: { kind: "TIER", have: "0" } });
    expect(out.chain.loadAccount).not.toHaveBeenCalled();
  });

  it("always opens the artist's own stories for them", async () => {
    const owner: SessionUser = { ...fan, id: ARTIST_USER };
    const { ctx } = setup({ stories: [storyRow({ audience: "FOLLOWERS" })] });
    expect((await artistStories(ctx, owner, "dj-tamsin", now)).stories[0]!.lock).toBeNull();
  });

  it("marks the ones the viewer has already seen", async () => {
    const { ctx } = setup({ stories: [storyRow({ views: [{ userId: "fan" }] })] });
    expect((await artistStories(ctx, fan, "dj-tamsin", now)).stories[0]!.seen).toBe(true);
  });

  it("says so when the artist isn't there", async () => {
    const { ctx } = setup({ artist: null });
    await expect(artistStories(ctx, null, "nobody", now)).rejects.toThrow(/artist not found/i);
  });
});

describe("viewing a story", () => {
  it("records one view per person", async () => {
    const { ctx, db } = setup();
    expect(await markStoryViewed(ctx, fan, "s1", now)).toEqual({ recorded: true });
    expect(db.storyView.createMany).toHaveBeenCalledWith({
      data: [{ storyId: "s1", userId: "fan" }],
      skipDuplicates: true,
    });
  });

  it("doesn't count the artist's own views, or a story the viewer can't open", async () => {
    const own = setup();
    expect(await markStoryViewed(own.ctx, { ...fan, id: ARTIST_USER }, "s1", now)).toEqual({
      recorded: false,
    });
    expect(own.db.storyView.createMany).not.toHaveBeenCalled();

    const locked = setup();
    locked.db.story.findFirst.mockResolvedValue({
      id: "s1",
      audience: "FOLLOWERS",
      tier: null,
      artist: artistRow,
    });
    expect(await markStoryViewed(locked.ctx, fan, "s1", now)).toEqual({ recorded: false });
    expect(locked.db.storyView.createMany).not.toHaveBeenCalled();
  });

  it("ignores a story that ended or was taken down", async () => {
    const { ctx, db } = setup();
    db.story.findFirst.mockResolvedValue(null);
    await expect(markStoryViewed(ctx, fan, "gone", now)).rejects.toThrow(/story not found/i);
  });
});

describe("the story archive", () => {
  const endedRow = (over: Record<string, unknown> = {}) => {
    const { views: _views, ...rest } = storyRow({
      createdAt: new Date("2026-11-01T09:00:00Z"),
      expiresAt: new Date("2026-11-02T09:00:00Z"),
      ...over,
    });
    return rest;
  };

  it("lists the artist's ended stories, newest first, never the live or taken-down ones", async () => {
    const { ctx, db } = setup({ stories: [endedRow()] });
    const result = await storyArchive(ctx, null, { slug: "dj-tamsin" }, now);
    expect(result.artist).toEqual({ name: "DJ Tamsin", slug: "dj-tamsin", avatarUrl: null });
    expect(result.stories).toEqual([
      expect.objectContaining({ id: "s1", url: "https://cdn/s1.jpg", lock: null }),
    ]);
    expect(db.story.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { artistId: "a0", removedAt: null, expiresAt: { lte: now } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 25,
      }),
    );
  });

  it("keeps the audience a story had: a followers' story is a lock to someone who doesn't follow", async () => {
    const { ctx } = setup({ stories: [endedRow({ audience: "FOLLOWERS" })] });
    const [story] = (await storyArchive(ctx, fan, { slug: "dj-tamsin" }, now)).stories;
    expect(story).toMatchObject({
      url: null,
      thumbnailUrl: null,
      caption: null,
      lock: { kind: "FOLLOW" },
    });
  });

  it("opens a subscribers' story only for a fan who trusts the fan token", async () => {
    const stories = [endedRow({ audience: "SUBSCRIBERS" })];
    const trusting = setup({ stories });
    const [open] = (await storyArchive(trusting.ctx, fan, { slug: "dj-tamsin" }, now)).stories;
    expect(open).toMatchObject({ url: "https://cdn/s1.jpg", lock: null });

    const plain = setup({ stories });
    plain.chain.loadAccount.mockResolvedValue({ balances: [] });
    const [locked] = (await storyArchive(plain.ctx, fan, { slug: "dj-tamsin" }, now)).stories;
    expect(locked).toMatchObject({
      url: null,
      lock: expect.objectContaining({ kind: expect.any(String) }),
    });
    expect(locked?.lock).not.toBeNull();
  });

  it("always opens the artist's own old stories for them", async () => {
    const { ctx } = setup({ stories: [endedRow({ audience: "MEMBERS" })] });
    const owner: SessionUser = { ...fan, id: ARTIST_USER };
    const [story] = (await storyArchive(ctx, owner, { slug: "dj-tamsin" }, now)).stories;
    expect(story).toMatchObject({ url: "https://cdn/s1.jpg", lock: null });
  });

  it("pages 24 at a time: the extra row becomes the cursor for the next page", async () => {
    const rows = Array.from({ length: 25 }, (_, index) => endedRow({ id: `s${index}` }));
    const { ctx, db } = setup({ stories: rows });
    const page = await storyArchive(ctx, null, { slug: "dj-tamsin" }, now);
    expect(page.stories).toHaveLength(24);
    expect(page.nextCursor).toBe("s24");

    db.story.findMany.mockResolvedValue([endedRow({ id: "s24" })]);
    const last = await storyArchive(ctx, null, { slug: "dj-tamsin", cursor: "s24" }, now);
    expect(last.nextCursor).toBeNull();
    expect(db.story.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: { id: "s24" } }),
    );
  });

  it("says so when the artist isn't there", async () => {
    const { ctx } = setup({ artist: null });
    await expect(storyArchive(ctx, null, { slug: "nobody" }, now)).rejects.toMatchObject({
      code: "RESOURCE_NOT_FOUND",
    });
  });
});

describe("the cleanup", () => {
  it("keeps ended stories for the archive and only clears ones taken down a day ago", async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 3 });
    const ctx = { db: { story: { deleteMany } } } as never;
    expect(await sweepStories(ctx, now)).toEqual({ deleted: 3 });
    const before = new Date(now.getTime() - STORY_KEEP_MS);
    expect(deleteMany).toHaveBeenCalledWith({ where: { removedAt: { lt: before } } });
  });
});
