import { Account, Keypair } from "@stellar/stellar-sdk";
import { describe, expect, it, vi } from "vitest";

import {
  setSubscribed,
  syncAllSubscribers,
  syncViewerSubscription,
} from "../services/feed/subscribe";

const TOKEN = { code: "NOVA", issuer: "GISSUER" };
const WALLET = Keypair.random().publicKey();
const trusting = (balance = "0") =>
  Object.assign(new Account(WALLET, "1"), {
    balances: [
      {
        asset_type: "credit_alphanum4",
        asset_code: TOKEN.code,
        asset_issuer: TOKEN.issuer,
        balance,
        selling_liabilities: "0",
      },
    ],
  });
const bare = () => Object.assign(new Account(WALLET, "1"), { balances: [] });

const artist = (over: object = {}) => ({
  id: "a1",
  fanTokenItem: { classicToken: TOKEN },
  ...over,
});

function setup(opts: { follow?: { isTemporary: boolean } | null; account?: unknown } = {}) {
  const db = {
    follow: {
      findUnique: vi.fn().mockResolvedValue(opts.follow ?? null),
      upsert: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findMany: vi.fn().mockResolvedValue([]),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    artist: { findMany: vi.fn().mockResolvedValue([]) },
    user: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const chain = {
    loadAccount: vi.fn().mockResolvedValue(opts.account === undefined ? bare() : opts.account),
    assetTrustees: vi.fn().mockResolvedValue({ addresses: [], complete: true }),
  };
  return { ctx: { db, chain } as never, db, chain };
}
const user = { id: "u1", walletAddress: WALLET };

describe("syncViewerSubscription", () => {
  it("makes a trusting fan a subscriber, following them if they weren't", async () => {
    const { ctx, db } = setup({ account: trusting() });
    expect(await syncViewerSubscription(ctx, user, artist())).toEqual({
      following: true,
      subscribed: true,
    });
    expect(db.follow.upsert).toHaveBeenCalledWith({
      where: { userId_artistId: { userId: "u1", artistId: "a1" } },
      create: { userId: "u1", artistId: "a1", isTemporary: false },
      update: { isTemporary: false },
    });
  });

  it("counts a trustline with nothing held", async () => {
    const { ctx } = setup({ account: trusting("0") });
    expect((await syncViewerSubscription(ctx, user, artist())).subscribed).toBe(true);
  });

  it("leaves a follower a follower, and writes nothing when nothing changed", async () => {
    const { ctx, db } = setup({ follow: { isTemporary: true } });
    expect(await syncViewerSubscription(ctx, user, artist())).toEqual({
      following: true,
      subscribed: false,
    });
    expect(db.follow.upsert).not.toHaveBeenCalled();
    expect(db.follow.updateMany).not.toHaveBeenCalled();
  });

  it("drops a subscriber back to follower when the trustline is gone", async () => {
    const { ctx, db } = setup({ follow: { isTemporary: false } });
    expect(await syncViewerSubscription(ctx, user, artist())).toEqual({
      following: true,
      subscribed: false,
    });
    expect(db.follow.updateMany).toHaveBeenCalledWith({
      where: { userId: "u1", artistId: "a1" },
      data: { isTemporary: true },
    });
  });

  it("is never a subscriber without a fan token, and doesn't read the wallet", async () => {
    const { ctx, chain } = setup({ follow: { isTemporary: true } });
    expect(await syncViewerSubscription(ctx, user, artist({ fanTokenItem: null }))).toEqual({
      following: true,
      subscribed: false,
    });
    expect(chain.loadAccount).not.toHaveBeenCalled();
  });

  it("changes nothing when the wallet can't be read", async () => {
    const { ctx, chain, db } = setup({ follow: { isTemporary: false } });
    chain.loadAccount.mockRejectedValue(new Error("horizon down"));
    expect(await syncViewerSubscription(ctx, user, artist())).toEqual({
      following: true,
      subscribed: true,
    });
    expect(db.follow.updateMany).not.toHaveBeenCalled();
  });
});

describe("setSubscribed", () => {
  it("follows and subscribes in one step", async () => {
    const { db } = setup();
    await setSubscribed(db as never, "u1", "a1");
    expect(db.follow.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: { userId: "u1", artistId: "a1", isTemporary: false } }),
    );
  });
});

describe("the worker sync", () => {
  it("subscribes known users who trust the token, creates their follows, and demotes the rest", async () => {
    const { ctx, db, chain } = setup();
    db.artist.findMany.mockResolvedValue([artist()]);
    chain.assetTrustees.mockResolvedValue({ addresses: ["GA", "GB", "GUNKNOWN"], complete: true });
    db.user.findMany.mockResolvedValue([
      { id: "uA", walletAddress: "GA" },
      { id: "uB", walletAddress: "GB" },
    ]);
    // uA already follows (as a follower); uB doesn't follow; uC follows and no longer trusts.
    db.follow.findMany.mockResolvedValue([
      { userId: "uA", isTemporary: true },
      { userId: "uC", isTemporary: false },
    ]);
    expect(await syncAllSubscribers(ctx)).toEqual({ artists: 1, subscribed: 2, demoted: 1 });
    expect(db.follow.createMany).toHaveBeenCalledWith({
      data: [{ userId: "uB", artistId: "a1", isTemporary: false }],
      skipDuplicates: true,
    });
    expect(db.follow.updateMany).toHaveBeenCalledWith({
      where: { artistId: "a1", userId: { in: ["uA"] } },
      data: { isTemporary: false },
    });
    expect(db.follow.updateMany).toHaveBeenCalledWith({
      where: { artistId: "a1", userId: { in: ["uC"] } },
      data: { isTemporary: true },
    });
  });

  it("never demotes anyone from a list it couldn't read in full", async () => {
    const { ctx, db, chain } = setup();
    db.artist.findMany.mockResolvedValue([artist()]);
    chain.assetTrustees.mockResolvedValue({ addresses: [], complete: false });
    db.follow.findMany.mockResolvedValue([{ userId: "uC", isTemporary: false }]);
    expect(await syncAllSubscribers(ctx)).toMatchObject({ demoted: 0 });
  });

  it("skips an artist whose list can't be read and carries on", async () => {
    const { ctx, db, chain } = setup();
    db.artist.findMany.mockResolvedValue([artist({ id: "a1" }), artist({ id: "a2" })]);
    chain.assetTrustees
      .mockRejectedValueOnce(new Error("horizon down"))
      .mockResolvedValueOnce({ addresses: [], complete: true });
    expect((await syncAllSubscribers(ctx)).artists).toBe(1);
  });
});
