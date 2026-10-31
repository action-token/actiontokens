import {
  Account,
  Keypair,
  Networks,
  type Transaction,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { AppError } from "@bandcoin/errors";
import { describe, expect, it, vi } from "vitest";

import type { Db } from "@bandcoin/db";

import { createContext, type SessionUser } from "../context";
import { portalRouter } from "../root-portal";
import {
  approveArtist,
  banArtist,
  listApplications,
  rejectArtist,
  unbanArtist,
} from "../services/admin/artists";
import { getArtist } from "../services/admin/artist-detail";
import type { ChainGateway } from "../services/chain-gateway";
import { createCallerFactory } from "../trpc";

const createFanToken = vi.hoisted(() => vi.fn());
vi.mock("../services/artist/fan-token", () => ({ createFanToken }));
const openStorage = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ publicKey: "GS", supply: "1000000" }),
);
vi.mock("../services/artist/storage-account", () => ({ openStorage }));

const artistWallet = Keypair.random().publicKey();
const issuerKey = Keypair.random().publicKey();
const network = { passphrase: Networks.TESTNET, baseFee: "100" };
const admin: SessionUser = {
  id: "admin1",
  role: "ADMIN",
  walletAddress: Keypair.random().publicKey(),
  walletType: "freighter",
};

type Row = Record<string, unknown>;

function setup(
  opts: {
    artist?: Row | null;
    issuerOnChain?: boolean;
    submit?: (xdr: string) => Promise<{ hash: string }>;
  } = {},
) {
  const artist: Row | null =
    opts.artist === null
      ? null
      : {
          id: "a1",
          userId: "u1",
          name: "Luna Vale",
          slug: "luna-vale",
          status: "PENDING",
          issuerAccountId: "chain1",
          rejectionReason: null,
          createdAt: new Date("2026-10-01"),
          user: {
            id: "u1",
            role: "FAN",
            walletAddress: artistWallet,
            username: "luna",
            displayName: "Luna",
          },
          issuerAccount: { id: "chain1", publicKey: issuerKey },
          ...opts.artist,
        };
  const db = {
    artist: {
      findUnique: vi.fn().mockResolvedValue(artist),
      findUniqueOrThrow: vi.fn(() => Promise.resolve(artist)),
      findMany: vi.fn().mockResolvedValue(artist ? [artist] : []),
      update: vi.fn(({ data }: { data: Row }) => Promise.resolve(Object.assign(artist!, data))),
    },
    user: { update: vi.fn().mockResolvedValue({}) },
    chainAccount: { delete: vi.fn().mockResolvedValue({}) },
    $transaction: (run: (tx: unknown) => unknown) => run(db),
  };
  const chain = {
    config: { network },
    loadAccount: vi
      .fn()
      .mockResolvedValue(opts.issuerOnChain === false ? null : new Account(issuerKey, "12")),
    signWithServerKeys: vi.fn((xdr: string) => Promise.resolve(xdr)),
    submit: vi.fn(opts.submit ?? ((_xdr: string) => Promise.resolve({ hash: "refundhash" }))),
  };
  const activity = { set: vi.fn(), facts: () => ({}) };
  return {
    ctx: { db: db as unknown as Db, chain: chain as unknown as ChainGateway, activity },
    db,
    chain,
    activity,
    artist,
  };
}

describe("approveArtist", () => {
  it("approves a paid application and makes the owner an artist", async () => {
    const { ctx, db, activity } = setup();
    await expect(approveArtist(ctx, "a1")).resolves.toEqual({
      artistId: "a1",
      status: "APPROVED",
      fanToken: { status: "NONE" },
      storage: { status: "OPENED", supply: "1000000" },
    });
    expect(db.artist.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "APPROVED", rejectionReason: null } }),
    );
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { role: "ARTIST" } });
    expect(activity.set).toHaveBeenCalledWith({ targetType: "Artist", targetId: "a1" });
  });

  it("opens storage on the platform, and still approves when that fails", async () => {
    const { ctx } = setup();
    await approveArtist(ctx, "a1");
    expect(openStorage).toHaveBeenLastCalledWith(ctx, expect.objectContaining({ id: "a1" }));
    openStorage.mockRejectedValueOnce(
      new AppError("PRECONDITION_NOT_MET", { message: "Short of XLM" }),
    );
    await expect(approveArtist(setup().ctx, "a1")).resolves.toMatchObject({
      status: "APPROVED",
      storage: { status: "FAILED", message: "Short of XLM" },
    });
  });

  it("makes the fan token chosen while applying, then forgets the choice", async () => {
    createFanToken.mockResolvedValueOnce({ itemId: "i1", code: "LUNA" });
    const chosen = { mode: "NEW", code: "LUNA", coverUrl: "https://cdn.example/t.png" };
    const { ctx, db, artist } = setup({
      artist: { pendingFanToken: chosen, fanTokenItemId: null },
    });
    await expect(approveArtist(ctx, "a1")).resolves.toMatchObject({
      fanToken: { status: "CREATED", code: "LUNA" },
    });
    expect(createFanToken).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ id: "a1", slug: "luna-vale" }),
      { id: "u1" },
      { mode: "CUSTOM", code: "LUNA", coverUrl: "https://cdn.example/t.png" },
    );
    expect(db.artist.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { id: "a1" } }),
    );
    expect(artist).toMatchObject({ status: "APPROVED" });
  });

  it("still approves when the chosen token can't be made, and says why", async () => {
    createFanToken.mockRejectedValueOnce(new Error("boom"));
    const chosen = {
      mode: "EXISTING",
      code: "LUNA",
      issuer: issuerKey,
      coverUrl: "https://cdn.example/t.png",
    };
    const { ctx, artist } = setup({ artist: { pendingFanToken: chosen, fanTokenItemId: null } });
    await expect(approveArtist(ctx, "a1")).resolves.toMatchObject({
      status: "APPROVED",
      fanToken: { status: "FAILED", message: "The fan token couldn't be made." },
    });
    expect(createFanToken.mock.lastCall?.[3]).toEqual({
      mode: "EXISTING",
      code: "LUNA",
      issuer: issuerKey,
      coverUrl: "https://cdn.example/t.png",
    });
    expect(artist).toMatchObject({ status: "APPROVED", pendingFanToken: chosen });
  });

  it("never lowers an admin's role", async () => {
    const { ctx, db } = setup({
      artist: { user: { id: "u1", role: "ADMIN", walletAddress: artistWallet } },
    });
    await approveArtist(ctx, "a1");
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("won't approve someone who hasn't opened their artist account, or who isn't waiting", async () => {
    await expect(
      approveArtist(setup({ artist: { issuerAccountId: null, issuerAccount: null } }).ctx, "a1"),
    ).rejects.toMatchObject({
      message: "They haven't opened their artist account yet.",
    });
    await expect(
      approveArtist(setup({ artist: { status: "APPROVED" } }).ctx, "a1"),
    ).rejects.toMatchObject({ message: "This application isn't waiting for review." });
    await expect(approveArtist(setup({ artist: null }).ctx, "a1")).rejects.toMatchObject({
      message: "Artist not found",
    });
  });
});

describe("rejectArtist", () => {
  it("returns the XLM first: the issuer closes into the artist's wallet, signed by the platform", async () => {
    const { ctx, chain, db, artist } = setup();
    await expect(
      rejectArtist(ctx, { artistId: "a1", reason: "Use your real name" }),
    ).resolves.toEqual({ artistId: "a1", status: "REJECTED", refundTxHash: "refundhash" });

    expect(chain.signWithServerKeys).toHaveBeenCalledWith(expect.any(String), [issuerKey]);
    const sent = TransactionBuilder.fromXDR(
      chain.submit.mock.calls[0]![0],
      Networks.TESTNET,
    ) as Transaction;
    expect(sent.source).toBe(issuerKey);
    expect(sent.operations[0]).toMatchObject({ type: "accountMerge", destination: artistWallet });
    expect(artist).toMatchObject({
      status: "REJECTED",
      rejectionReason: "Use your real name",
      issuerAccountId: null,
    });
    expect(db.chainAccount.delete).toHaveBeenCalledWith({ where: { id: "chain1" } });
  });

  it("keeps everything as it was when the refund fails", async () => {
    const { ctx, db, artist } = setup({ submit: () => Promise.reject(new Error("tx_failed")) });
    await expect(rejectArtist(ctx, { artistId: "a1", reason: "No" })).rejects.toThrow("tx_failed");
    expect(artist).toMatchObject({ status: "PENDING", issuerAccountId: "chain1" });
    expect(db.chainAccount.delete).not.toHaveBeenCalled();
  });

  it("rejects an unpaid application without sending anything", async () => {
    const { ctx, chain, artist } = setup({
      artist: { issuerAccountId: null, issuerAccount: null },
    });
    await expect(
      rejectArtist(ctx, { artistId: "a1", reason: "Not a band" }),
    ).resolves.toMatchObject({ status: "REJECTED", refundTxHash: null });
    expect(chain.submit).not.toHaveBeenCalled();
    expect(artist).toMatchObject({ status: "REJECTED" });
  });

  it("skips the refund when the issuer account is already gone from the network", async () => {
    const { ctx, chain } = setup({ issuerOnChain: false });
    await expect(rejectArtist(ctx, { artistId: "a1", reason: "Duplicate" })).resolves.toMatchObject(
      { status: "REJECTED", refundTxHash: null },
    );
    expect(chain.submit).not.toHaveBeenCalled();
  });

  it("only rejects applications that are waiting for review", async () => {
    await expect(
      rejectArtist(setup({ artist: { status: "APPROVED" } }).ctx, {
        artistId: "a1",
        reason: "Too late",
      }),
    ).rejects.toMatchObject({
      message: "This application isn't waiting for review.",
    });
  });
});

describe("banArtist", () => {
  it("bans without a refund", async () => {
    const { ctx, chain, artist } = setup({ artist: { status: "APPROVED" } });
    await expect(banArtist(ctx, "a1")).resolves.toEqual({ artistId: "a1", status: "BANNED" });
    expect(artist).toMatchObject({ status: "BANNED" });
    expect(chain.submit).not.toHaveBeenCalled();
  });

  it("says so when they're already banned", async () => {
    await expect(
      banArtist(setup({ artist: { status: "BANNED" } }).ctx, "a1"),
    ).rejects.toMatchObject({ message: "They are already banned." });
  });
});

describe("unbanArtist", () => {
  it("approves again someone who had opened their artist account", async () => {
    const { ctx, artist, activity } = setup({ artist: { status: "BANNED" } });
    await expect(unbanArtist(ctx, "a1")).resolves.toEqual({ artistId: "a1", status: "APPROVED" });
    expect(artist).toMatchObject({ status: "APPROVED" });
    expect(activity.set).toHaveBeenCalledWith({ targetType: "Artist", targetId: "a1" });
  });

  it("puts someone without an artist account back to waiting", async () => {
    const { ctx } = setup({ artist: { status: "BANNED", issuerAccountId: null } });
    await expect(unbanArtist(ctx, "a1")).resolves.toEqual({ artistId: "a1", status: "PENDING" });
  });

  it("only unbans the banned", async () => {
    await expect(
      unbanArtist(setup({ artist: { status: "APPROVED" } }).ctx, "a1"),
    ).rejects.toMatchObject({ message: "They aren't banned." });
  });
});

describe("getArtist", () => {
  it("shows the artist, their accounts, counts and recent pins", async () => {
    const db = {
      artist: {
        findUnique: vi.fn().mockResolvedValue({
          id: "a1",
          name: "Luna Vale",
          slug: "luna-vale",
          bio: null,
          avatarUrl: null,
          coverUrl: null,
          status: "APPROVED",
          rejectionReason: null,
          createdAt: new Date("2026-10-01"),
          user: {
            id: "u1",
            username: "luna",
            displayName: null,
            email: "luna@example.com",
            walletAddress: artistWallet,
            suspendedAt: null,
          },
          issuerAccount: { publicKey: issuerKey },
          storageAccount: null,
          fanTokenItem: { title: "Luna", coverUrl: "c", classicToken: { code: "LUNA" } },
          _count: { pins: 1, followers: 4, posts: 2, bounties: 0, items: 3, tiers: 1 },
          pins: [
            {
              id: "p1",
              title: "Rooftop",
              imageUrl: null,
              approval: "PENDING",
              isHidden: false,
              startsAt: new Date("2026-10-02"),
              endsAt: new Date("2026-10-09"),
              claimLimit: 10,
              claimsLeft: 6,
              _count: { spots: 2 },
            },
          ],
        }),
      },
      pinClaim: { count: vi.fn().mockResolvedValue(4) },
    };
    const artist = await getArtist({ db: db as unknown as Db }, "a1");
    expect(artist).toMatchObject({
      owner: { id: "u1", name: "luna", email: "luna@example.com", suspended: false },
      issuer: issuerKey,
      storage: null,
      fanToken: { code: "LUNA" },
      counts: { pins: 1, followers: 4, items: 3, collected: 4 },
      recentPins: [{ id: "p1", approval: "PENDING", spots: 2, claimed: 4, paused: false }],
    });
    expect(db.pinClaim.count).toHaveBeenCalledWith({
      where: { spot: { pin: { artistId: "a1" } } },
    });
  });

  it("says when the artist doesn't exist", async () => {
    const db = { artist: { findUnique: vi.fn().mockResolvedValue(null) } };
    await expect(getArtist({ db: db as unknown as Db }, "x")).rejects.toThrow(/Artist not found/);
  });
});

describe("listApplications", () => {
  it("shows waiting applications first, with who owns them and whether they paid", async () => {
    const { ctx, db } = setup();
    db.artist.findMany.mockResolvedValue([
      {
        id: "a2",
        name: "Old",
        slug: "old",
        status: "APPROVED",
        bio: null,
        rejectionReason: null,
        createdAt: new Date("2026-09-01"),
        avatarUrl: null,
        issuerAccount: { publicKey: "G1" },
        fanTokenItem: { classicToken: { code: "OLD" } },
        _count: { pins: 3, followers: 7 },
        user: { username: "o", displayName: null, walletAddress: "GW" },
      },
      {
        id: "a1",
        name: "Luna Vale",
        slug: "luna-vale",
        status: "PENDING",
        bio: "hi",
        rejectionReason: null,
        createdAt: new Date("2026-10-01"),
        avatarUrl: null,
        issuerAccount: null,
        fanTokenItem: null,
        _count: { pins: 0, followers: 0 },
        user: { id: "u1", username: "luna", displayName: "Luna", walletAddress: artistWallet },
      },
    ]);
    const rows = await listApplications(ctx, {});
    expect(
      rows.map((row) => [row.id, row.status, row.paid, row.fanToken, row.pins, row.followers]),
    ).toEqual([
      ["a1", "PENDING", false, null, 0, 0],
      ["a2", "APPROVED", true, "OLD", 3, 7],
    ]);
    expect(rows[0]).toMatchObject({
      owner: { id: "u1", name: "Luna", username: "luna", walletAddress: artistWallet },
    });
  });
});

describe("admin router", () => {
  const caller = (user: SessionUser | null) =>
    createCallerFactory(portalRouter)(
      createContext({
        db: { activityLog: { create: vi.fn() } } as unknown as Db,
        chain: {} as ChainGateway,
        app: "artist",
        session: user ? { user } : null,
      }),
    );

  it("is for admins only", async () => {
    await expect(caller(null).admin.artists.list({})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(
      caller({ ...admin, role: "ARTIST" }).admin.artists.approve({ artistId: "a1" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller({ ...admin, role: "FAN" }).admin.activity.list({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("needs a reason to reject", async () => {
    await expect(
      caller(admin).admin.artists.reject({ artistId: "a1", reason: "" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
