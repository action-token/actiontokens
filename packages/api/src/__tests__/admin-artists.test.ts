import {
  Account,
  Keypair,
  Networks,
  type Transaction,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { describe, expect, it, vi } from "vitest";

import type { Db } from "@bandcoin/db";

import { createContext, type SessionUser } from "../context";
import { portalRouter } from "../root-portal";
import {
  approveArtist,
  banArtist,
  listApplications,
  rejectArtist,
} from "../services/admin/artists";
import type { ChainGateway } from "../services/chain-gateway";
import { createCallerFactory } from "../trpc";

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
    await expect(approveArtist(ctx, "a1")).resolves.toEqual({ artistId: "a1", status: "APPROVED" });
    expect(db.artist.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "APPROVED", rejectionReason: null } }),
    );
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { role: "ARTIST" } });
    expect(activity.set).toHaveBeenCalledWith({ targetType: "Artist", targetId: "a1" });
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
        issuerAccount: { publicKey: "G1" },
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
        issuerAccount: null,
        user: { id: "u1", username: "luna", displayName: "Luna", walletAddress: artistWallet },
      },
    ]);
    const rows = await listApplications(ctx, {});
    expect(rows.map((row) => [row.id, row.status, row.paid])).toEqual([
      ["a1", "PENDING", false],
      ["a2", "APPROVED", true],
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
