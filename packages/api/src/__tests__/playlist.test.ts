import { describe, expect, it, vi } from "vitest";

import type { Db } from "@bandcoin/db";

import { createContext, type SessionUser } from "../context";
import { appRouter } from "../root-app";
import type { ChainGateway } from "../services/chain-gateway";
import { createCallerFactory } from "../trpc";

const me: SessionUser = { id: "me", role: "FAN", walletAddress: "GABC", walletType: "frieghter" };

function caller(db: object, user: SessionUser | null = me) {
  const full = { ...db, activityLog: { create: vi.fn().mockResolvedValue({}) } } as unknown as Db;
  return createCallerFactory(appRouter)(createContext({ db: full, chain: {} as ChainGateway, app: "app", session: user ? { user } : null }));
}

describe("playlists", () => {
  it("adds a song to the end of your own playlist, once", async () => {
    const playlistTrack = {
      count: vi.fn().mockResolvedValue(2),
      findFirst: vi.fn().mockResolvedValue({ sortOrder: 7 }),
      upsert: vi.fn().mockResolvedValue({}),
    };
    const db = {
      playlist: { findUnique: vi.fn().mockResolvedValue({ id: "p1", ownerId: "me" }), update: vi.fn().mockResolvedValue({}) },
      item: { findFirst: vi.fn().mockResolvedValue({ id: "song" }) },
      playlistTrack,
    };
    await caller(db).playlist.addTrack({ playlistId: "p1", itemId: "song" });
    expect(playlistTrack.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: { playlistId: "p1", itemId: "song", sortOrder: 8 }, update: {} }),
    );
  });

  it("won't touch someone else's playlist, or add something that isn't a song", async () => {
    const theirs = { playlist: { findUnique: vi.fn().mockResolvedValue({ id: "p1", ownerId: "them" }) } };
    await expect(caller(theirs).playlist.addTrack({ playlistId: "p1", itemId: "song" })).rejects.toMatchObject({ message: "Playlist not found." });
    await expect(caller(theirs).playlist.delete({ playlistId: "p1" })).rejects.toMatchObject({ message: "Playlist not found." });

    const notASong = {
      playlist: { findUnique: vi.fn().mockResolvedValue({ id: "p1", ownerId: "me" }) },
      item: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    await expect(caller(notASong).playlist.addTrack({ playlistId: "p1", itemId: "ticket" })).rejects.toMatchObject({
      message: "Only songs can go in a playlist.",
    });
  });

  it("hides private playlists from everyone but their owner", async () => {
    const privateList = {
      playlist: {
        findUnique: vi.fn().mockResolvedValue({
          id: "p1",
          name: "Late",
          description: null,
          isPublic: false,
          coverUrl: null,
          updatedAt: new Date(),
          owner: { id: "me", username: "nadia", displayName: null, avatarUrl: null },
          tracks: [],
        }),
      },
    };
    await expect(caller(privateList, null).playlist.byId({ playlistId: "p1" })).rejects.toMatchObject({ message: "Playlist not found." });
    expect((await caller(privateList).playlist.byId({ playlistId: "p1" })).isOwner).toBe(true);
  });

  it("explains a duplicate name instead of failing", async () => {
    const db = { playlist: { create: vi.fn().mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" })) } };
    await expect(caller(db).playlist.create({ name: "Road trip" })).rejects.toMatchObject({
      message: "You already have a playlist with that name.",
    });
  });
});
