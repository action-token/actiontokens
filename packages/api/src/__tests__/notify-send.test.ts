import { describe, expect, it, vi } from "vitest";

import { notify, notifyArtist, notifyFollowers } from "../services/notifications/send";

function setup(over: { followers?: string[]; sent?: boolean; fail?: boolean } = {}) {
  const created: unknown[] = [];
  const db = {
    notificationEvent: {
      create: vi.fn((args: unknown) => {
        if (over.fail) return Promise.reject(new Error("db down"));
        created.push(args);
        return Promise.resolve({});
      }),
      findFirst: vi.fn().mockResolvedValue(over.sent ? { id: "e1" } : null),
    },
    follow: {
      findMany: vi
        .fn()
        .mockResolvedValue((over.followers ?? ["f1", "f2"]).map((userId) => ({ userId }))),
    },
  };
  return { ctx: { db } as never, db, created };
}

const recipientsOf = (args: unknown) =>
  (args as { data: { notifications: { createMany: { data: unknown[] } } } }).data.notifications
    .createMany.data;

describe("notify", () => {
  it("skips the actor and anyone listed twice", async () => {
    const { ctx, created } = setup();
    await notify(ctx, {
      type: "LIKE",
      actorId: "me",
      entityId: "p1",
      recipients: [{ id: "me" }, { id: "a", isForArtist: true }, { id: "a", isForArtist: true }],
    });
    expect(recipientsOf(created[0])).toEqual([{ recipientId: "a", isForArtist: true }]);
  });

  it("writes nothing when nobody is left, and never throws", async () => {
    const { ctx, db } = setup({ fail: true });
    await notify(ctx, { type: "LIKE", actorId: "me", recipients: [{ id: "me" }] });
    expect(db.notificationEvent.create).not.toHaveBeenCalled();
    await expect(
      notifyArtist(ctx, { type: "FOLLOW", actorId: "fan", artistUserId: "artist" }),
    ).resolves.toBeUndefined();
  });
});

describe("notifyFollowers", () => {
  it("tells every follower, from the artist", async () => {
    const { ctx, created } = setup();
    await notifyFollowers(ctx, {
      type: "NEW_ITEM",
      organization: { id: "a1", userId: "artist" },
      entityId: "i1",
    });
    expect(created[0]).toMatchObject({
      data: { type: "NEW_ITEM", actorId: "artist", entityId: "i1" },
    });
    expect(recipientsOf(created[0])).toHaveLength(2);
  });

  it("announces a thing once", async () => {
    const { ctx, db } = setup({ sent: true });
    await notifyFollowers(ctx, {
      type: "NEW_ITEM",
      organization: { id: "a1", userId: "artist" },
      entityId: "i1",
      once: true,
    });
    expect(db.follow.findMany).not.toHaveBeenCalled();
  });
});
