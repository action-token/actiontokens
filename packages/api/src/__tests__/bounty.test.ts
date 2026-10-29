import { Account, Keypair, Networks } from "@stellar/stellar-sdk";
import { describe, expect, it, vi } from "vitest";

import { buildBountyClaim } from "@bandcoin/chain";
import type { Db } from "@bandcoin/db";

import { createContext, type SessionUser } from "../context";
import { appRouter } from "../root-app";
import { progressOf } from "../routers/app/bounty";
import type { ChainGateway } from "../services/chain-gateway";
import { artistNamesMatch } from "../services/lastfm";
import { createCallerFactory } from "../trpc";

const scrobbles = vi.hoisted(() => ({ total: 0 }));
vi.mock("../services/lastfm", async (original) => ({
  ...(await original<typeof import("../services/lastfm")>()),
  countScrobbles: () => Promise.resolve(scrobbles.total),
}));

const winnerKey = Keypair.random().publicKey();
const escrow = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
const network = { passphrase: Networks.TESTNET, baseFee: "100" };
const me: SessionUser = {
  id: "me",
  role: "FAN",
  walletAddress: winnerKey,
  walletType: "frieghter",
};

function caller(db: object, user: SessionUser | null = me, chain: Partial<ChainGateway> = {}) {
  const full = { ...db, activityLog: { create: vi.fn().mockResolvedValue({}) } } as unknown as Db;
  const gateway = {
    config: { network, escrowContract: escrow },
    ...chain,
  } as unknown as ChainGateway;
  return createCallerFactory(appRouter)(
    createContext({ db: full, chain: gateway, app: "app", session: user ? { user } : null }),
  );
}

const running = { id: "b1", status: "RUNNING", artist: { userId: "artist-user" } };
const claimXdr = (bountyId = "b1", winner = winnerKey) =>
  buildBountyClaim({
    source: new Account(winner, "1"),
    network,
    contract: escrow,
    bountyId,
    winner,
  }).xdr;

describe("bounties", () => {
  it("joins once, tells the artist, and treats a second join as done", async () => {
    const db = {
      bounty: { findFirst: vi.fn().mockResolvedValue(running) },
      bountyParticipant: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
      },
      notificationEvent: { create: vi.fn().mockResolvedValue({}) },
    };
    await caller(db).bounty.join({ bountyId: "b1" });
    expect(db.bountyParticipant.create).toHaveBeenCalledWith({
      data: { bountyId: "b1", userId: "me" },
    });
    expect(db.notificationEvent.create).toHaveBeenCalledWith({
      data: {
        type: "BOUNTY_JOINED",
        actorId: "me",
        entityId: "b1",
        notifications: { create: { recipientId: "artist-user", isForArtist: true } },
      },
    });

    db.bountyParticipant.findUnique.mockResolvedValue({ id: "p1" });
    db.bountyParticipant.create.mockClear();
    await caller(db).bounty.join({ bountyId: "b1" });
    expect(db.bountyParticipant.create).not.toHaveBeenCalled();
  });

  it("only shows and accepts funded bounties", async () => {
    const db = { bounty: { findFirst: vi.fn().mockResolvedValue(null) } };
    await expect(caller(db).bounty.join({ bountyId: "b1" })).rejects.toMatchObject({
      message: "This bounty doesn't exist.",
    });
    expect(db.bounty.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "b1", fundTxHash: { not: null } } }),
    );
  });

  it("won't let artists join their own bounty, or anyone join a paused or ended one", async () => {
    const own = { bounty: { findFirst: vi.fn().mockResolvedValue(running) } };
    await expect(
      caller(own, { ...me, id: "artist-user" }).bounty.join({ bountyId: "b1" }),
    ).rejects.toMatchObject({
      message: "You can't join your own bounty.",
    });
    const paused = {
      bounty: { findFirst: vi.fn().mockResolvedValue({ ...running, status: "PAUSED" }) },
    };
    await expect(caller(paused).bounty.join({ bountyId: "b1" })).rejects.toMatchObject({
      message: "This bounty is paused for now.",
    });
    const ended = {
      bounty: { findFirst: vi.fn().mockResolvedValue({ ...running, status: "COMPLETED" }) },
    };
    await expect(caller(ended).bounty.join({ bountyId: "b1" })).rejects.toMatchObject({
      message: "This bounty has ended.",
    });
  });

  it("takes a report from a participant and tells the artist", async () => {
    const db = {
      bounty: { findFirst: vi.fn().mockResolvedValue(running) },
      bountyParticipant: {
        findUnique: vi.fn().mockResolvedValue({ id: "p1", joinedAt: new Date() }),
      },
      bountySubmission: { create: vi.fn().mockResolvedValue({ id: "s1" }) },
      notificationEvent: { create: vi.fn().mockResolvedValue({}) },
    };
    await caller(db).bounty.submitReport({ bountyId: "b1", content: "  **My cover** " });
    const created = db.bountySubmission.create.mock.calls[0]?.[0] as { data: unknown };
    expect(created.data).toEqual({ bountyId: "b1", userId: "me", body: "**My cover**" });
    const event = db.notificationEvent.create.mock.calls[0]?.[0] as { data: { type: string } };
    expect(event.data.type).toBe("BOUNTY_SUBMISSION");

    db.bountyParticipant.findUnique.mockResolvedValue(null);
    await expect(
      caller(db).bounty.submitReport({ bountyId: "b1", content: "hi" }),
    ).rejects.toMatchObject({
      message: "Join the bounty first.",
    });
  });

  it("filters the grid like before: Not joined skips yours and your own, Joined needs a sign-in", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const db = {
      bounty: { findMany },
      bountyParticipant: { findMany: vi.fn().mockResolvedValue([]) },
    };
    await caller(db).bounty.list({ filter: "not_joined" });
    const args = findMany.mock.calls[0]?.[0] as { where: Record<string, unknown> };
    expect(args.where).toMatchObject({
      status: { not: "COMPLETED" },
      participants: { none: { userId: "me" } },
      artist: { userId: { not: "me" } },
    });

    findMany.mockClear();
    expect(await caller(db, null).bounty.list({ filter: "joined" })).toEqual({
      items: [],
      nextCursor: null,
    });
    expect(findMany).not.toHaveBeenCalled();
  });

  it("works out listening progress per song and overall", () => {
    const progress = progressOf(
      [
        { id: "t1", targetPlays: 2 },
        { id: "t2", targetPlays: 4 },
      ],
      [
        { trackId: "t1", currentPlays: 2, isSatisfied: true },
        { trackId: "t2", currentPlays: 1, isSatisfied: false },
      ],
    );
    expect(progress).toEqual({
      tracks: [
        { trackId: "t1", plays: 2, done: true, percent: 100 },
        { trackId: "t2", plays: 1, done: false, percent: 25 },
      ],
      doneCount: 1,
      percent: 63,
    });
  });

  it("syncs Last.fm plays: the first sync sets a baseline, later ones count above it", async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const db = {
      lastFmAccount: { findFirst: vi.fn().mockResolvedValue({ username: "fyron" }) },
      bountyParticipant: {
        findUnique: vi.fn().mockResolvedValue({ id: "p1", joinedAt: new Date() }),
      },
      bountyTrack: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: "t1", title: "Song", artistName: "Band", targetPlays: 2 }]),
      },
      bountyTrackProgress: { findUnique: vi.fn().mockResolvedValue(null), upsert },
    };
    scrobbles.total = 5;
    await caller(db).bounty.syncProgress({ bountyId: "b1" });
    expect(upsert.mock.calls[0]?.[0]).toMatchObject({
      create: { baselinePlays: 5, currentPlays: 0 },
    });

    db.bountyTrackProgress.findUnique.mockResolvedValue({ baselinePlays: 5 });
    scrobbles.total = 8;
    await caller(db).bounty.syncProgress({ bountyId: "b1" });
    expect(upsert.mock.calls[1]?.[0]).toMatchObject({
      update: { currentPlays: 3, isSatisfied: true },
    });

    db.lastFmAccount.findFirst.mockResolvedValue(null);
    await expect(caller(db).bounty.syncProgress({ bountyId: "b1" })).rejects.toMatchObject({
      message: "Connect Last.fm first.",
    });
  });

  it("matches artist names the old way", () => {
    expect(artistNamesMatch("Lumen Avenue", "lumen avenue")).toBe(true);
    expect(artistNamesMatch("Lumen Avenue Band", "Lumen Avenue")).toBe(true);
    expect(artistNamesMatch("Someone Else", "Lumen Avenue")).toBe(false);
  });
});

describe("claiming a prize", () => {
  const unclaimed = () => ({
    bountyWinner: {
      findUnique: vi.fn().mockResolvedValue({ id: "w1", claimedAt: null }),
      update: vi.fn().mockResolvedValue({}),
    },
  });

  it("prepares the escrow's claim_reward call with the winner as source", async () => {
    const prepareContractCall = vi.fn((xdr: string) => Promise.resolve(xdr));
    const chain = {
      loadAccount: vi
        .fn()
        .mockResolvedValue({ accountId: () => winnerKey, sequenceNumber: () => "7" }),
      prepareContractCall,
    };
    const result = await caller(unclaimed(), me, chain).bounty.claimPrepare({ bountyId: "b1" });
    expect(result.signer).toBe("wallet");
    expect(prepareContractCall).toHaveBeenCalledOnce();
  });

  it("refuses non-winners and second claims", async () => {
    const none = { bountyWinner: { findUnique: vi.fn().mockResolvedValue(null) } };
    await expect(caller(none).bounty.claimPrepare({ bountyId: "b1" })).rejects.toMatchObject({
      message: "You're not a winner of this bounty.",
    });
    const claimed = {
      bountyWinner: { findUnique: vi.fn().mockResolvedValue({ id: "w1", claimedAt: new Date() }) },
    };
    await expect(
      caller(claimed).bounty.claimSubmit({ bountyId: "b1", xdr: claimXdr() }),
    ).rejects.toMatchObject({
      message: "You've already claimed this prize.",
    });
  });

  it("submits only the matching claim and records it", async () => {
    const db = unclaimed();
    const submit = vi.fn().mockResolvedValue({ hash: "abc" });
    await caller(db, me, { submit }).bounty.claimSubmit({ bountyId: "b1", xdr: claimXdr() });
    expect(submit).toHaveBeenCalledWith(claimXdr());
    expect(db.bountyWinner.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { claimedAt: expect.any(Date) as Date, txHash: "abc" } }),
    );

    for (const forged of [
      claimXdr("another-bounty"),
      claimXdr("b1", Keypair.random().publicKey()),
    ]) {
      await expect(
        caller(unclaimed(), me, { submit }).bounty.claimSubmit({ bountyId: "b1", xdr: forged }),
      ).rejects.toMatchObject({
        message: "That transaction isn't this prize claim.",
      });
    }
  });

  it("signs for custodial winners after the countdown", async () => {
    const signForCustodialUser = vi.fn().mockResolvedValue("signed");
    const submit = vi.fn().mockResolvedValue({ hash: "abc" });
    const custodial = { ...me, walletType: "emailPass", email: "fan@example.com" };
    const xdr = claimXdr();
    await caller(unclaimed(), custodial, { submit, signForCustodialUser }).bounty.claimSubmit({ bountyId: "b1", xdr });
    expect(signForCustodialUser).toHaveBeenCalledWith(xdr, "fan@example.com");
    expect(submit).toHaveBeenCalledWith("signed");
  });
});
