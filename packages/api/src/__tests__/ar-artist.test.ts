import { describe, expect, it, vi } from "vitest";

import type { Db } from "@actiontokens/db";

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
      findUnique: vi.fn().mockResolvedValue({ userId: "u1" }),
      upsert: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      count: vi.fn().mockResolvedValue(13),
    },
    activityLog: { create: vi.fn().mockResolvedValue({}) },
  };
  const chain = { loadAccount: vi.fn().mockResolvedValue({ balances: [] }) };
  const caller = createCallerFactory(arRouter)(
    createContext({
      db: db as unknown as Db,
      chain: chain as unknown as ChainGateway,
      app: "ar",
      session: user ? { user } : null,
    }),
  );
  return { db, chain, caller };
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

  it("lists the fan token and who subscribes from the saved follow", async () => {
    const { caller, db } = setup();
    db.artist.findMany.mockResolvedValue([
      { ...artistRow, fanTokenItem: { classicToken: { code: "LUNA", issuer: "GISSUER" } } },
      { ...artistRow, id: "a2", fanTokenItem: null },
    ]);
    db.follow.findMany.mockResolvedValue([
      { artistId: "a1", isTemporary: false },
      { artistId: "a2", isTemporary: true },
    ]);
    const [luna, other] = await caller.artist.list();
    expect(luna).toMatchObject({ fanToken: "LUNA", followed: true, subscribed: true });
    expect(other).toMatchObject({ fanToken: null, followed: true, subscribed: false });
  });

  it("checks the wallet on the artist's page, as the fan app does", async () => {
    const { caller, db, chain } = setup();
    db.artist.findFirst.mockResolvedValue({
      ...artistRow,
      fanTokenItem: { classicToken: { code: "LUNA", issuer: "GISSUER" } },
    });
    db.follow.findUnique.mockResolvedValue({ isTemporary: true });
    chain.loadAccount.mockResolvedValue({
      balances: [
        {
          asset_type: "credit_alphanum4",
          asset_code: "LUNA",
          asset_issuer: "GISSUER",
          balance: "0",
        },
      ],
    });
    await expect(caller.artist.byId({ id: "a1" })).resolves.toMatchObject({
      fanToken: "LUNA",
      followed: true,
      subscribed: true,
    });
    expect(chain.loadAccount).toHaveBeenCalledWith("GME");
    expect(db.follow.upsert).toHaveBeenCalled();
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
    await expect(caller.artist.byId({ id: "pending" })).rejects.toMatchObject({
      message: "This artist doesn't exist.",
    });
    expect(db.artist.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "pending", status: "APPROVED" } }),
    );
  });
});

describe("ar artist.setFollowing", () => {
  it("follows and unfollows for free, returning the follower count", async () => {
    const { caller, db } = setup();
    await expect(caller.artist.setFollowing({ artistId: "a1", following: true })).resolves.toEqual({
      following: true,
      subscribed: false,
      followers: 13,
      subscribers: 13,
      fanToken: null,
    });
    expect(db.follow.upsert).toHaveBeenCalledWith({
      where: { userId_artistId: { userId: "me", artistId: "a1" } },
      create: { userId: "me", artistId: "a1", isTemporary: true },
      update: { isTemporary: true },
    });
    await caller.artist.setFollowing({ artistId: "a1", following: false });
    expect(db.follow.deleteMany).toHaveBeenCalledWith({ where: { userId: "me", artistId: "a1" } });
  });

  it("needs a signed-in fan", async () => {
    await expect(
      setup(null).caller.artist.setFollowing({ artistId: "a1", following: true }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("ar bounty", () => {
  it("serves the fan app's bounties, with the artist on Top bounties", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "b1",
        title: "Stream it",
        prizeAmount: 30000,
        prizeCurrency: "XLM",
        artist: { name: "Luna Vale", avatarUrl: null },
      },
    ]);
    const chain = { config: { name: "testnet", assets: {} } } as unknown as ChainGateway;
    const caller = createCallerFactory(arRouter)(
      createContext({
        db: { bounty: { findMany } } as unknown as Db,
        chain,
        app: "ar",
        session: null,
      }),
    );
    await expect(caller.bounty.top()).resolves.toEqual([
      {
        id: "b1",
        title: "Stream it",
        artist: { name: "Luna Vale", avatarUrl: null },
        prize: {
          amount: "30000",
          currency: "XLM",
          code: "XLM",
          explorerUrl: "https://stellar.expert/explorer/testnet/asset/XLM",
        },
      },
    ]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { fundTxHash: { not: null }, hiddenAt: null, status: "RUNNING" },
      }),
    );
  });
});
