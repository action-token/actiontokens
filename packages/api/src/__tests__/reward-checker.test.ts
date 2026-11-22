import { describe, expect, it, vi } from "vitest";

import type { Db } from "@actiontokens/db";

import { createContext } from "../context";
import { appRouter } from "../root-app";
import type { ChainGateway } from "../services/chain-gateway";
import { createCallerFactory } from "../trpc";

const W = (c: string) => `G${c.repeat(55)}`;

function caller({ chain = {}, db = {} }: { chain?: Partial<ChainGateway>; db?: object }) {
  return createCallerFactory(appRouter)(
    createContext({
      db: db as Db,
      chain: chain as ChainGateway,
      app: "app",
      session: null,
    }),
  );
}

describe("reward checker", () => {
  it("ranks a quarter round by lowest holding, shares 1 per 1,000, and searches by wallet", async () => {
    const round = {
      id: "q1",
      year: 2026,
      quarter: "OCT-DEC",
      data: [
        { accountId: W("A"), action: 2000 },
        { accountId: W("B"), action: 9000 },
        { accountId: W("C"), action: 5000 },
      ],
      completedUsers: [W("B")],
      pendingUsers: [],
      pendingTx: null,
      pendingUntil: null,
      rewardedAt: null,
    };
    const db = {
      quarterReward: { findUnique: vi.fn().mockResolvedValue(round) },
      quarterBlockedUser: { findMany: vi.fn().mockResolvedValue([{ walletAddress: W("C") }]) },
    };
    const api = caller({ db });
    const board = await api.reward.leaderboard({ kind: "quarter", id: "q1" });
    expect(board.rows.map((r) => [r.rank, r.wallet, r.amount, r.paid])).toEqual([
      [1, W("B"), "9.0000000", true],
      [2, W("C"), null, false],
      [3, W("A"), "2.0000000", false],
    ]);
    const found = await api.reward.leaderboard({ kind: "quarter", id: "q1", search: W("A") });
    expect(found.rows.map((r) => r.rank)).toEqual([3]);
    expect(found.matched).toBe(1);
  });

  it("lists a token's holders biggest first, leaving out empty trustlines", async () => {
    const assetHolders = vi.fn().mockResolvedValue({
      holders: [
        { address: W("A"), balance: "5" },
        { address: W("B"), balance: "0" },
        { address: W("C"), balance: "50" },
      ],
      complete: true,
    });
    const out = await caller({ chain: { assetHolders } }).reward.holders({
      assetCode: "ACTION",
      assetIssuer: W("D"),
    });
    expect(out.rows.map((r) => [r.rank, r.wallet])).toEqual([
      [1, W("C")],
      [2, W("A")],
    ]);
  });

  it("checks a wallet that was never funded without touching the rounds", async () => {
    const loadAccount = vi.fn().mockResolvedValue(null);
    const out = await caller({ chain: { loadAccount } }).reward.check({ wallet: W("A") });
    expect(out.found).toBe(false);
    expect(out.rewards).toEqual([]);
  });

  it("refuses something that isn't a wallet address", async () => {
    await expect(caller({}).reward.check({ wallet: "nope" })).rejects.toThrow();
  });
});
