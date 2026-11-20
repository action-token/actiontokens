import { describe, expect, it, vi } from "vitest";

import { listLiveStories, takeDownStory } from "../services/admin/stories";

const now = new Date("2026-11-05T12:00:00Z");

function setup(story: object | null = { id: "s1", removedAt: null }) {
  const db = {
    story: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(story),
      update: vi.fn().mockResolvedValue({}),
    },
  };
  const activity = { set: vi.fn(), facts: () => ({}) };
  return { ctx: { db, activity } as never, db, activity };
}

describe("admin stories", () => {
  it("lists the live stories, newest first, with whose they are and their views", async () => {
    const { ctx, db } = setup();
    db.story.findMany.mockResolvedValue([
      {
        id: "s1",
        type: "VIDEO",
        url: "u",
        thumbnailUrl: null,
        caption: "Hi",
        audience: "MEMBERS",
        createdAt: now,
        expiresAt: new Date(now.getTime() + 3_600_000),
        organization: { id: "a1", name: "DJ Tamsin", slug: "dj-tamsin" },
        _count: { views: 4 },
      },
    ]);
    expect(await listLiveStories(ctx, now)).toEqual([
      expect.objectContaining({
        id: "s1",
        views: 4,
        organization: expect.objectContaining({ name: "DJ Tamsin" }),
      }),
    ]);
    expect(db.story.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { removedAt: null, expiresAt: { gt: now } },
        orderBy: { createdAt: "desc" },
      }),
    );
  });

  it("takes a story down with the reason, and logs it", async () => {
    const { ctx, db, activity } = setup();
    await takeDownStory(ctx, { storyId: "s1", reason: " Not allowed " }, now);
    expect(db.story.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { removedAt: now, removedReason: "Not allowed" },
    });
    expect(activity.set).toHaveBeenCalledWith({ targetType: "Story", targetId: "s1" });
  });

  it("says when the story isn't there", async () => {
    const { ctx, db } = setup(null);
    await expect(takeDownStory(ctx, { storyId: "x", reason: "Nope" }, now)).rejects.toThrow(
      /story not found/i,
    );
    expect(db.story.update).not.toHaveBeenCalled();
  });
});
