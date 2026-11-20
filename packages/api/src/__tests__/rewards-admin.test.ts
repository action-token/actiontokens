import { describe, expect, it, vi } from "vitest";

import type { Db } from "@actiontokens/db";

import { createContext, type SessionUser } from "../context";
import { portalRouter } from "../root-portal";
import type { ChainGateway } from "../services/chain-gateway";
import { createCallerFactory } from "../trpc";

const admin: SessionUser = {
  id: "a1",
  role: "ADMIN",
  walletAddress: "GADMIN",
  walletType: "freighter",
};
const fan: SessionUser = { id: "f1", role: "FAN", walletAddress: "GFAN", walletType: "freighter" };

function caller(db: object, user: SessionUser = admin) {
  const full = { ...db, activityLog: { create: vi.fn().mockResolvedValue({}) } } as unknown as Db;
  return createCallerFactory(portalRouter)(
    createContext({ db: full, chain: {} as ChainGateway, app: "org", session: { user } }),
  );
}

const round = (over: object = {}) => ({
  id: "r1",
  isDistributed: false,
  data: [{ pubkey: "G1", plotBal: 1, plots: [{}] }],
  totalBalance: 10,
  jobId: null,
  ...over,
});
const jobDb = (found: object | null, job: object | null = null) => ({
  originReward: {
    findUnique: vi.fn().mockResolvedValue(found),
    update: vi.fn().mockResolvedValue({}),
  },
  job: {
    findUnique: vi.fn().mockResolvedValue(job),
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ id: "j1" }),
  },
});

describe("admin.rewards.distribute", () => {
  it("queues one payment job and remembers it on the round", async () => {
    const db = jobDb(round());
    expect(await caller(db).admin.rewards.distribute({ kind: "origin", id: "r1" })).toEqual({
      jobId: "j1",
    });
    expect(db.job.create.mock.calls[0]![0].data).toMatchObject({
      type: "rewards.distribute",
      payload: { kind: "origin", id: "r1" },
    });
    expect(db.originReward.update).toHaveBeenCalledWith({
      where: { id: "r1" },
      data: { jobId: "j1" },
    });
  });

  it.each([
    ["already paid", round({ isDistributed: true }), /already paid/],
    ["no holders", round({ data: [] }), /no holders/],
    ["no pot", round({ totalBalance: 0 }), /Set the month's pot/],
  ])("refuses a round that is %s", async (_name, found, message) => {
    await expect(
      caller(jobDb(found)).admin.rewards.distribute({ kind: "origin", id: "r1" }),
    ).rejects.toThrow(message);
  });

  it("won't start a second payment while one is running", async () => {
    const db = jobDb(round({ jobId: "j0" }), { status: "RUNNING" });
    await expect(caller(db).admin.rewards.distribute({ kind: "origin", id: "r1" })).rejects.toThrow(
      /in progress/,
    );
    expect(db.job.create).not.toHaveBeenCalled();
  });

  it("is for admins only", async () => {
    await expect(
      caller(jobDb(round()), fan).admin.rewards.distribute({ kind: "origin", id: "r1" }),
    ).rejects.toThrow();
  });
});

describe("admin.rewards.setPot and block", () => {
  it("won't change a paid month's pot", async () => {
    const db = {
      originReward: {
        findUnique: vi.fn().mockResolvedValue({ isDistributed: true }),
        upsert: vi.fn(),
      },
    };
    await expect(
      caller(db).admin.rewards.setPot({ monthYear: "2026-11", amount: "100" }),
    ).rejects.toThrow(/already paid/);
    expect(db.originReward.upsert).not.toHaveBeenCalled();
  });

  it("rejects a malformed wallet and a wallet blocked twice", async () => {
    const db = {
      quarterBlockedUser: { findUnique: vi.fn().mockResolvedValue({ id: "x" }), create: vi.fn() },
    };
    await expect(
      caller(db).admin.rewards.block({ kind: "quarter", walletAddress: "nope" }),
    ).rejects.toThrow();
    await expect(
      caller(db).admin.rewards.block({ kind: "quarter", walletAddress: `G${"A".repeat(55)}` }),
    ).rejects.toThrow(/already blocked/);
  });
});

describe("admin.telegram", () => {
  it("shows only a masked token", async () => {
    const db = {
      telegramConfig: {
        findFirst: vi
          .fn()
          .mockResolvedValue({
            botToken: "123456:ABCDEFGHIJ",
            chatId: "-1",
            enabled: true,
            updatedAt: null,
          }),
      },
    };
    const result = await caller(db).admin.telegram.get();
    expect(result.botTokenMasked).toBe("123456…GHIJ");
    expect(JSON.stringify(result)).not.toContain("ABCDEFGH");
  });

  it("keeps the stored token when saving without a new one, and needs one the first time", async () => {
    const update = vi.fn().mockResolvedValue({});
    const db = {
      telegramConfig: {
        findFirst: vi.fn().mockResolvedValue({ id: "t1" }),
        update,
        create: vi.fn(),
      },
    };
    await caller(db).admin.telegram.save({ chatId: "-2", enabled: true, botToken: "" });
    expect(update.mock.calls[0]![0].data).not.toHaveProperty("botToken");
    const fresh = {
      telegramConfig: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
    };
    await expect(
      caller(fresh).admin.telegram.save({ chatId: "-2", enabled: true }),
    ).rejects.toThrow(/token is needed/);
  });
});
