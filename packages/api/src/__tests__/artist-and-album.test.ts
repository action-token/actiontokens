import { describe, expect, it, vi } from "vitest";

import type { Db } from "@bandcoin/db";

import { createContext, type SessionUser } from "../context";
import { appRouter } from "../root-app";
import type { ChainGateway } from "../services/chain-gateway";
import { createCallerFactory } from "../trpc";

const fan: SessionUser = { id: "u1", role: "FAN", walletAddress: "GABC", walletType: "frieghter" };

function caller(db: object, user: SessionUser | null = fan) {
  const full = { ...db, activityLog: { create: vi.fn().mockResolvedValue({}) } } as unknown as Db;
  return createCallerFactory(appRouter)(createContext({ db: full, chain: {} as ChainGateway, app: "app", session: user ? { user } : null }));
}

describe("artist.setFollowing", () => {
  it("follows and unfollows, returning the new follower count", async () => {
    const follow = { upsert: vi.fn().mockResolvedValue({}), deleteMany: vi.fn().mockResolvedValue({ count: 1 }), count: vi.fn().mockResolvedValue(5) };
    const db = { artist: { findFirst: vi.fn().mockResolvedValue({ id: "a1" }) }, follow };

    expect(await caller(db).artist.setFollowing({ slug: "dj-tamsin", following: true })).toEqual({ following: true, followers: 5 });
    expect(follow.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: { userId: "u1", artistId: "a1" } }));

    await caller(db).artist.setFollowing({ slug: "dj-tamsin", following: false });
    expect(follow.deleteMany).toHaveBeenCalledWith({ where: { userId: "u1", artistId: "a1" } });
  });

  it("needs a signed-in fan and a real artist", async () => {
    const db = { artist: { findFirst: vi.fn().mockResolvedValue(null) }, follow: {} };
    await expect(caller(db, null).artist.setFollowing({ slug: "x", following: true })).rejects.toThrow();
    await expect(caller(db).artist.setFollowing({ slug: "x", following: true })).rejects.toMatchObject({ message: "This artist doesn't exist." });
  });
});

describe("music.album", () => {
  const track = (id: string, durationSec: number | null) => ({
    item: {
      id,
      slug: id,
      title: id,
      type: "TRACK",
      coverUrl: "c",
      supply: null,
      playCount: 0,
      createdAt: new Date(),
      artist: { name: "DJ Tamsin", slug: "dj-tamsin" },
      track: null,
      media: { mediaType: "AUDIO", durationSec },
      listings: [],
    },
  });

  it("returns the songs in order with the album's total length", async () => {
    const db = {
      album: {
        findUnique: vi.fn().mockResolvedValue({
          title: "Circle Line",
          slug: "dj-tamsin-circle-line",
          description: null,
          coverUrl: "c",
          createdAt: new Date("2026-01-01"),
          artist: { name: "DJ Tamsin", slug: "dj-tamsin", avatarUrl: null },
          tracks: [track("a", 305), track("b", 274), track("c", null)],
        }),
      },
    };
    const album = await caller(db, null).music.album({ slug: "dj-tamsin-circle-line" });
    expect(album.tracks.map((entry) => entry.id)).toEqual(["a", "b", "c"]);
    expect(album.durationSec).toBe(579);
    expect(album.year).toBe(2026);
  });
});
