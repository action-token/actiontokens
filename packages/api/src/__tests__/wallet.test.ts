import { describe, expect, it, vi } from "vitest";

import type { Db } from "@bandcoin/db";

import { createContext, type SessionUser } from "../context";
import { appRouter } from "../root-app";
import type { ChainGateway } from "../services/chain-gateway";
import { createCallerFactory } from "../trpc";

const me: SessionUser = { id: "me", role: "FAN", walletAddress: "GME", walletType: "freighter" };

function setup(user: SessionUser | null = me, network: "testnet" | "mainnet" = "testnet") {
  const db = {
    order: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "o1",
          kind: "ITEM_PURCHASE",
          status: "DELIVERED",
          currency: "BANDCOIN",
          total: "50.0000000",
          quantity: 2,
          txHash: "aa",
          createdAt: new Date("2026-10-03"),
          item: { title: "Night Drive" },
        },
        {
          id: "o2",
          kind: "RECHARGE",
          status: "DELIVERED",
          currency: "USD",
          total: "9.9900000",
          quantity: 1,
          txHash: "bb",
          createdAt: new Date("2026-10-05"),
          item: null,
        },
        {
          id: "o3",
          kind: "XLM_SWAP",
          status: "FAILED",
          currency: "BANDCOIN",
          total: "74.31",
          quantity: 1,
          txHash: null,
          createdAt: new Date("2026-10-04"),
          item: null,
        },
      ]),
    },
    bountyWinner: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "w1",
          prizeAmount: "300.0000000",
          txHash: "cc",
          claimedAt: new Date("2026-10-06"),
          bounty: { title: "Film the set", prizeCurrency: "USDC" },
        },
      ]),
    },
    activityLog: { create: vi.fn().mockResolvedValue({}) },
  };
  const chain = { config: { name: network } } as unknown as ChainGateway;
  const caller = createCallerFactory(appRouter)(
    createContext({ db: db as unknown as Db, chain, app: "app", session: user ? { user } : null }),
  );
  return { db, caller };
}

describe("wallet.history", () => {
  it("needs a signed-in fan", async () => {
    await expect(setup(null).caller.wallet.history()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("merges orders and claimed bounty prizes, newest first, in plain words", async () => {
    const { caller } = setup();
    const history = await caller.wallet.history();
    expect(
      history.map((entry) => [
        entry.title,
        entry.direction,
        entry.amount,
        entry.currency,
        entry.status,
      ]),
    ).toEqual([
      ["Bounty prize: Film the set", "received", "300", "USDC", "DELIVERED"],
      ["Top-up with card", "paid", "9.99", "USD", "DELIVERED"],
      ["Swap BANDCOIN for 1 XLM", "paid", "74.31", "BANDCOIN", "FAILED"],
      ["Bought 2 × Night Drive", "paid", "50", "BANDCOIN", "DELIVERED"],
    ]);
  });

  it("links each transaction to the explorer for the right network, and only when there is one", async () => {
    const testnet = await setup().caller.wallet.history();
    expect(testnet[1]?.explorerUrl).toBe("https://stellar.expert/explorer/testnet/tx/bb");
    expect(testnet[2]?.explorerUrl).toBeNull();
    expect((await setup(me, "mainnet").caller.wallet.history())[1]?.explorerUrl).toBe(
      "https://stellar.expert/explorer/public/tx/bb",
    );
  });

  it("only reads the fan's own orders that actually reached the chain or failed, not carts or cancellations", async () => {
    const { caller, db } = setup();
    await caller.wallet.history();
    expect(db.order.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: {
        buyerId: "me",
        status: { in: ["SUBMITTED", "CONFIRMED", "DELIVERED", "FAILED", "REFUNDED"] },
      },
    });
    expect(db.bountyWinner.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: { userId: "me", claimedAt: { not: null } },
    });
  });
});
