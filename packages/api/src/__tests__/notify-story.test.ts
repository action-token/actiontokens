import { describe, expect, it, vi } from "vitest";

import { announceStory } from "../services/notifications/story";

const now = new Date("2026-11-05T12:00:00Z");
const artist = { id: "a1", userId: "artist-user" };

function setup(over: { followers?: string[]; told?: string[] } = {}) {
  const db = {
    follow: {
      findMany: vi
        .fn()
        .mockResolvedValue((over.followers ?? ["f1", "f2"]).map((userId) => ({ userId }))),
    },
    notification: {
      findMany: vi
        .fn()
        .mockResolvedValue((over.told ?? []).map((recipientId) => ({ recipientId }))),
    },
    notificationEvent: { create: vi.fn().mockResolvedValue({}) },
  };
  return { ctx: { db } as never, db };
}

const recipientsOf = (db: ReturnType<typeof setup>["db"]) =>
  (
    db.notificationEvent.create.mock.calls[0]?.[0] as {
      data: { notifications: { createMany: { data: { recipientId: string }[] } } };
    }
  ).data.notifications.createMany.data.map((row) => row.recipientId);

describe("telling followers about a story", () => {
  it("tells every follower about an everyone or followers story, once, from the artist", async () => {
    for (const audience of ["EVERYONE", "FOLLOWERS"] as const) {
      const { ctx, db } = setup();
      await announceStory(ctx, { organization: artist, audience, now });
      expect(db.follow.findMany).toHaveBeenCalledWith({
        where: { organizationId: "a1" },
        select: { userId: true },
      });
      expect(db.notificationEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ type: "STORY", actorId: "artist-user", entityId: "a1" }),
      });
      expect(recipientsOf(db)).toEqual(["f1", "f2"]);
    }
  });

  it("tells only subscribers about a subscribers or members story", async () => {
    for (const audience of ["SUBSCRIBERS", "MEMBERS"] as const) {
      const { ctx, db } = setup({ followers: ["sub"] });
      await announceStory(ctx, { organization: artist, audience, now });
      expect(db.follow.findMany).toHaveBeenCalledWith({
        where: { organizationId: "a1", isTemporary: false },
        select: { userId: true },
      });
      expect(recipientsOf(db)).toEqual(["sub"]);
    }
  });

  it("skips anyone already told about a story by this artist in the last 24 hours", async () => {
    const { ctx, db } = setup({ followers: ["f1", "f2", "f3"], told: ["f2"] });
    await announceStory(ctx, { organization: artist, audience: "EVERYONE", now });
    expect(db.notification.findMany).toHaveBeenCalledWith({
      where: {
        recipientId: { in: ["f1", "f2", "f3"] },
        isForArtist: false,
        event: {
          type: "STORY",
          actorId: "artist-user",
          createdAt: { gt: new Date("2026-11-04T12:00:00Z") },
        },
      },
      select: { recipientId: true },
    });
    expect(recipientsOf(db)).toEqual(["f1", "f3"]);
  });

  it("sends nothing when there is nobody to tell, or everyone was told today", async () => {
    const none = setup({ followers: [] });
    await announceStory(none.ctx, { organization: artist, audience: "EVERYONE", now });
    expect(none.db.notificationEvent.create).not.toHaveBeenCalled();

    const told = setup({ followers: ["f1"], told: ["f1"] });
    await announceStory(told.ctx, { organization: artist, audience: "EVERYONE", now });
    expect(told.db.notificationEvent.create).not.toHaveBeenCalled();
  });

  it("never fails the story over a notification", async () => {
    const { ctx, db } = setup();
    db.follow.findMany.mockRejectedValue(new Error("db down"));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(
      announceStory(ctx, { organization: artist, audience: "EVERYONE", now }),
    ).resolves.toBeUndefined();
    log.mockRestore();
  });
});
