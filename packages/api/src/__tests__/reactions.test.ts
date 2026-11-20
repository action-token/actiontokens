import { describe, expect, it, vi } from "vitest";

import type { Db } from "@actiontokens/db";

import { createContext, type SessionUser } from "../context";
import { appRouter } from "../root-app";
import type { ChainGateway } from "../services/chain-gateway";
import { createCallerFactory } from "../trpc";

const me: SessionUser = { id: "me", role: "FAN", walletAddress: "GME", walletType: "freighter" };

function setup(user: SessionUser | null = me) {
  const db = {
    item: {
      findFirst: vi.fn().mockResolvedValue({ id: "i1" }),
      update: vi.fn().mockResolvedValue({ playCount: 8 }),
      findMany: vi.fn().mockResolvedValue([
        { id: "i1", _count: { likes: 3, dislikes: 1 } },
        { id: "i2", _count: { likes: 0, dislikes: 0 } },
      ]),
    },
    playEvent: { create: vi.fn().mockResolvedValue({}) },
    itemLike: {
      findMany: vi.fn().mockResolvedValue([{ itemId: "i1" }]),
      upsert: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      count: vi.fn(({ where }: { where: { userId?: string } }) =>
        Promise.resolve(where.userId ? 0 : 4),
      ),
    },
    itemDislike: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      count: vi.fn(({ where }: { where: { userId?: string } }) =>
        Promise.resolve(where.userId ? 0 : 0),
      ),
    },
    trackFavorite: {
      findMany: vi.fn().mockResolvedValue([{ itemId: "i2" }]),
      upsert: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    activityLog: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn(),
  };
  db.$transaction.mockImplementation((run: (tx: typeof db) => unknown) => run(db));
  const caller = createCallerFactory(appRouter)(
    createContext({
      db: db as unknown as Db,
      chain: {} as ChainGateway,
      app: "app",
      session: user ? { user } : null,
    }),
  );
  return { db, caller };
}

describe("media.recordPlay", () => {
  it("counts every play start, signed in or not, previews included", async () => {
    const { db, caller } = setup(null);
    await expect(
      caller.media.recordPlay({ itemId: "i1", sessionId: "tab-123456", isPreview: true }),
    ).resolves.toEqual({ playCount: 8 });
    expect(db.playEvent.create).toHaveBeenCalledWith({
      data: { itemId: "i1", userId: null, sessionId: "tab-123456", isPreview: true },
    });
    expect(db.item.update).toHaveBeenCalledWith({
      where: { id: "i1" },
      data: { playCount: { increment: 1 } },
      select: { playCount: true },
    });
  });

  it("refuses an item that doesn't exist or was deleted", async () => {
    const { db, caller } = setup();
    db.item.findFirst.mockResolvedValue(null);
    await expect(
      caller.media.recordPlay({ itemId: "gone", sessionId: "tab-123456", isPreview: false }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(db.playEvent.create).not.toHaveBeenCalled();
  });
});

describe("reaction.states", () => {
  it("gives counts to everyone and your own like, dislike and favourite when signed in", async () => {
    await expect(setup().caller.reaction.states({ itemIds: ["i1", "i2"] })).resolves.toEqual({
      i1: { likes: 3, dislikes: 1, liked: true, disliked: false, favorite: false },
      i2: { likes: 0, dislikes: 0, liked: false, disliked: false, favorite: true },
    });
    const signedOut = setup(null);
    await expect(signedOut.caller.reaction.states({ itemIds: ["i1"] })).resolves.toMatchObject({
      i1: { likes: 3, liked: false, favorite: false },
    });
    expect(signedOut.db.itemLike.findMany).not.toHaveBeenCalled();
  });
});

describe("reactions", () => {
  it("a like removes your dislike, and a dislike removes your like", async () => {
    const { db, caller } = setup();
    await caller.reaction.setLike({ itemId: "i1", on: true });
    expect(db.itemLike.upsert).toHaveBeenCalledWith({
      where: { userId_itemId: { userId: "me", itemId: "i1" } },
      create: { userId: "me", itemId: "i1" },
      update: {},
    });
    expect(db.itemDislike.deleteMany).toHaveBeenCalledWith({
      where: { userId: "me", itemId: "i1" },
    });

    await caller.reaction.setDislike({ itemId: "i1", on: true });
    expect(db.itemDislike.upsert).toHaveBeenCalled();
    expect(db.itemLike.deleteMany).toHaveBeenLastCalledWith({
      where: { userId: "me", itemId: "i1" },
    });
  });

  it("turning one off leaves the other alone, and returns the new counts", async () => {
    const { db, caller } = setup();
    await expect(caller.reaction.setLike({ itemId: "i1", on: false })).resolves.toEqual({
      itemId: "i1",
      likes: 4,
      dislikes: 0,
      liked: false,
      disliked: false,
    });
    expect(db.itemDislike.deleteMany).not.toHaveBeenCalled();
  });

  it("reports what is really saved: removing a like keeps an existing dislike showing", async () => {
    const { db, caller } = setup();
    db.itemDislike.count.mockImplementation(() => Promise.resolve(1));
    await expect(caller.reaction.setLike({ itemId: "i1", on: false })).resolves.toMatchObject({
      liked: false,
      disliked: true,
      dislikes: 1,
    });
  });

  it("favourites are private: saved or removed with no count", async () => {
    const { db, caller } = setup();
    await expect(caller.reaction.setFavorite({ itemId: "i1", on: true })).resolves.toEqual({
      itemId: "i1",
      favorite: true,
    });
    expect(db.trackFavorite.upsert).toHaveBeenCalledWith({
      where: { userId_itemId: { userId: "me", itemId: "i1" } },
      create: { userId: "me", itemId: "i1" },
      update: {},
    });
    await caller.reaction.setFavorite({ itemId: "i1", on: false });
    expect(db.trackFavorite.deleteMany).toHaveBeenCalledWith({
      where: { userId: "me", itemId: "i1" },
    });
  });

  it("needs a signed-in fan", async () => {
    await expect(
      setup(null).caller.reaction.setLike({ itemId: "i1", on: true }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("collection.favorites", () => {
  it("lists your favourite songs, newest first, as song rows", async () => {
    const { db, caller } = setup();
    const row = {
      item: {
        id: "i2",
        slug: "night-drive",
        title: "Night Drive",
        type: "TRACK",
        coverUrl: "c",
        supply: null,
        playCount: 12,
        createdAt: new Date(),
        organization: { name: "Lumen Avenue", slug: "lumen" },
        track: null,
        media: { mediaType: "AUDIO", durationSec: 211 },
        listings: [],
      },
    };
    db.trackFavorite.findMany.mockResolvedValue([row]);
    await expect(caller.collection.favorites()).resolves.toMatchObject([
      { id: "i2", title: "Night Drive", playCount: 12, playable: true },
    ]);
    expect(db.trackFavorite.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: { userId: "me", item: { deletedAt: null } },
      orderBy: { createdAt: "desc" },
    });
  });
});
