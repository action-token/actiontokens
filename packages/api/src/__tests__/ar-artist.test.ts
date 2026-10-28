import { describe, expect, it, vi } from "vitest";

import type { Db } from "@bandcoin/db";

import { createContext, type SessionUser } from "../context";
import { arRouter } from "../root-ar";
import type { ChainGateway } from "../services/chain-gateway";
import { createCallerFactory } from "../trpc";

const me: SessionUser = { id: "me", role: "FAN", walletAddress: "GME", walletType: "freighter" };

const artistRow = {
  id: "a1",
  name: "Luna Vale",
  slug: "luna-vale",
  bio: null,
  avatarUrl: null,
  coverUrl: "https://cdn/cover.png",
  status: "APPROVED",
  _count: { followers: 12 },
};

function setup(user: SessionUser | null = me) {
  const db = {
    artist: {
      findMany: vi.fn().mockResolvedValue([artistRow]),
      findFirst: vi.fn().mockResolvedValue(artistRow),
    },
    pin: { groupBy: vi.fn().mockResolvedValue([{ artistId: "a1", _count: 3 }]) },
    pinTagLink: {
      findMany: vi.fn().mockResolvedValue([
        { pin: { artistId: "a1" }, tag: { label: "vinyl" } },
        { pin: { artistId: "a1" }, tag: { label: "launch" } },
        { pin: { artistId: "a1" }, tag: { label: "vinyl" } },
      ]),
    },
    follow: {
      findMany: vi.fn().mockResolvedValue([{ artistId: "a1" }]),
      upsert: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      count: vi.fn().mockResolvedValue(13),
    },
    activityLog: { create: vi.fn().mockResolvedValue({}) },
  };
  const caller = createCallerFactory(arRouter)(
    createContext({ db: db as unknown as Db, chain: {} as ChainGateway, app: "ar", session: user ? { user } : null }),
  );
  return { db, caller };
}

describe("ar artist.byId and list", () => {
  it("returns the artist with follow state, live pin count and sorted tags", async () => {
    const { caller } = setup();
    await expect(caller.artist.byId({ id: "a1" })).resolves.toMatchObject({
      id: "a1",
      handle: "luna-vale",
      bio: "",
      avatarUrl: "/brand/bandcoin-mark.png",
      verified: true,
      followed: true,
      followers: 12,
      pinCount: 3,
      categories: ["launch", "vinyl"],
    });
  });

  it("shows nobody as followed when signed out, without asking the database", async () => {
    const { caller, db } = setup(null);
    const [artist] = await caller.artist.list();
    expect(artist?.followed).toBe(false);
    expect(db.follow.findMany).not.toHaveBeenCalled();
  });

  it("only finds approved artists", async () => {
    const { caller, db } = setup();
    db.artist.findFirst.mockResolvedValue(null);
    await expect(caller.artist.byId({ id: "pending" })).rejects.toMatchObject({ message: "This artist doesn't exist." });
    expect(db.artist.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "pending", status: "APPROVED" } }));
  });
});

describe("ar artist.setFollowing", () => {
  it("follows and unfollows for free, returning the follower count", async () => {
    const { caller, db } = setup();
    await expect(caller.artist.setFollowing({ artistId: "a1", following: true })).resolves.toEqual({ following: true, followers: 13 });
    expect(db.follow.upsert).toHaveBeenCalledWith({
      where: { userId_artistId: { userId: "me", artistId: "a1" } },
      create: { userId: "me", artistId: "a1" },
      update: { isTemporary: false },
    });
    await caller.artist.setFollowing({ artistId: "a1", following: false });
    expect(db.follow.deleteMany).toHaveBeenCalledWith({ where: { userId: "me", artistId: "a1" } });
  });

  it("needs a signed-in fan", async () => {
    await expect(setup(null).caller.artist.setFollowing({ artistId: "a1", following: true })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
