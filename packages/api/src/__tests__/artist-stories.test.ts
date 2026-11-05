import { describe, expect, it, vi } from "vitest";

import type { Db } from "@bandcoin/db";

import {
  createStory,
  listMyStories,
  MAX_LIVE_STORIES,
  removeStory,
  STORY_LIFETIME_MS,
} from "../services/artist/stories";
import { announceStory } from "../services/notifications/story";

vi.mock("@bandcoin/storage", () => ({
  isOwnS3Url: (url: string) => url.startsWith("https://cdn.example/"),
}));
vi.mock("../services/notifications/story", () => ({ announceStory: vi.fn() }));

const artist = { id: "a1", userId: "artist-user" };
const now = new Date("2026-11-05T12:00:00Z");
const photo = { type: "IMAGE" as const, url: "https://cdn.example/s/1.jpg" };

function setup(over: { live?: number; tier?: object | null; story?: object | null } = {}) {
  const db = {
    story: {
      count: vi.fn().mockResolvedValue(over.live ?? 0),
      create: vi.fn().mockResolvedValue({ id: "s1" }),
      findFirst: vi
        .fn()
        .mockResolvedValue(over.story === undefined ? { id: "s1", removedAt: null } : over.story),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
    },
    membershipTier: {
      findFirst: vi.fn().mockResolvedValue(over.tier === undefined ? { id: "t1" } : over.tier),
    },
  };
  const activity = { set: vi.fn(), facts: () => ({}) };
  return { ctx: { db: db as unknown as Db, activity }, db, activity };
}

describe("adding a story", () => {
  it("tells the artist's followers, with the audience it was shared with", async () => {
    const { ctx } = setup();
    await createStory(ctx, artist, { ...photo, audience: "SUBSCRIBERS" }, now);
    expect(announceStory).toHaveBeenCalledWith(ctx, { artist, audience: "SUBSCRIBERS", now });
  });

  it("goes live at once for 24 hours, open to everyone by default", async () => {
    const { ctx, db, activity } = setup();
    expect(await createStory(ctx, artist, { ...photo, caption: "  Soundcheck  " }, now)).toEqual({
      storyId: "s1",
    });
    expect(db.story.create).toHaveBeenCalledWith({
      data: {
        artistId: "a1",
        type: "IMAGE",
        url: photo.url,
        thumbnailUrl: null,
        caption: "Soundcheck",
        audience: "EVERYONE",
        tierId: null,
        expiresAt: new Date(now.getTime() + STORY_LIFETIME_MS),
      },
      select: { id: true },
    });
    expect(STORY_LIFETIME_MS).toBe(24 * 60 * 60_000);
    expect(activity.set).toHaveBeenCalledWith({ targetType: "Story", targetId: "s1" });
  });

  it("takes a video, followers-only or members-only with the artist's own tier", async () => {
    const followers = setup();
    await createStory(
      followers.ctx,
      artist,
      { type: "VIDEO", url: "https://cdn.example/s/1.mp4", audience: "FOLLOWERS" },
      now,
    );
    expect(followers.db.story.create.mock.calls[0]![0].data).toMatchObject({
      type: "VIDEO",
      audience: "FOLLOWERS",
      tierId: null,
    });

    const members = setup();
    await createStory(members.ctx, artist, { ...photo, audience: "MEMBERS", tierId: "t1" }, now);
    expect(members.db.membershipTier.findFirst).toHaveBeenCalledWith({
      where: { id: "t1", artistId: "a1", isActive: true },
      select: { id: true },
    });
    expect(members.db.story.create.mock.calls[0]![0].data).toMatchObject({
      audience: "MEMBERS",
      tierId: "t1",
    });
  });

  it("refuses audio, files that weren't uploaded here, a long caption and a missing tier", async () => {
    const { ctx, db } = setup();
    await expect(
      createStory(ctx, artist, { type: "AUDIO", url: photo.url } as never, now),
    ).rejects.toThrow(/photo or a short video/i);
    await expect(
      createStory(ctx, artist, { type: "IMAGE", url: "https://evil.example/x.jpg" }, now),
    ).rejects.toThrow(/upload/i);
    await expect(
      createStory(ctx, artist, { ...photo, caption: "x".repeat(201) }, now),
    ).rejects.toThrow(/200 characters/i);
    await expect(createStory(ctx, artist, { ...photo, audience: "MEMBERS" }, now)).rejects.toThrow(
      /tier/i,
    );
    const noTier = setup({ tier: null });
    await expect(
      createStory(noTier.ctx, artist, { ...photo, audience: "MEMBERS", tierId: "t9" }, now),
    ).rejects.toThrow(/tier/i);
    expect(db.story.create).not.toHaveBeenCalled();
  });

  it("stops at ten live stories", async () => {
    const { ctx, db } = setup({ live: MAX_LIVE_STORIES });
    await expect(createStory(ctx, artist, photo, now)).rejects.toThrow(/10 live stories/i);
    expect(db.story.count).toHaveBeenCalledWith({
      where: { artistId: "a1", removedAt: null, expiresAt: { gt: now } },
    });
    expect(db.story.create).not.toHaveBeenCalled();
  });
});

describe("my stories", () => {
  it("lists the live ones, newest first, with how many have viewed each", async () => {
    const { ctx, db } = setup();
    db.story.findMany.mockResolvedValue([
      {
        id: "s2",
        type: "IMAGE",
        url: "u2",
        thumbnailUrl: null,
        caption: null,
        audience: "FOLLOWERS",
        tier: null,
        createdAt: now,
        expiresAt: new Date(now.getTime() + 3_600_000),
        _count: { views: 7 },
      },
    ]);
    expect(await listMyStories(ctx, artist, now)).toEqual([
      expect.objectContaining({ id: "s2", views: 7, audience: "FOLLOWERS", tierName: null }),
    ]);
    expect(db.story.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { artistId: "a1", removedAt: null, expiresAt: { gt: now } },
        orderBy: { createdAt: "desc" },
      }),
    );
  });
});

describe("taking a story down", () => {
  it("ends it now and logs it", async () => {
    const { ctx, db, activity } = setup();
    await removeStory(ctx, artist, "s1", now);
    expect(db.story.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { removedAt: now },
    });
    expect(activity.set).toHaveBeenCalledWith({ targetType: "Story", targetId: "s1" });
  });

  it("won't touch another artist's story", async () => {
    const { ctx, db } = setup({ story: null });
    await expect(removeStory(ctx, artist, "s9", now)).rejects.toThrow(/story not found/i);
    expect(db.story.update).not.toHaveBeenCalled();
  });
});
