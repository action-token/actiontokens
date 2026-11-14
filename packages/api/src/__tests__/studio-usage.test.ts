import { describe, expect, it, vi } from "vitest";

import type { Db } from "@bandcoin/db";

import { createContext, type SessionUser } from "../context";
import { studioRouter } from "../root-studio";
import type { ChainGateway } from "../services/chain-gateway";
import { studioUsage } from "../services/studio/usage";
import { createCallerFactory } from "../trpc";

const now = new Date("2026-11-13T12:00:00Z");
const DAY = 86_400_000;
const daysAgo = (days: number) => new Date(+now - days * DAY);

type Entry = {
  userId: string;
  kind: string;
  status: string;
  amount: number;
  createdAt: Date;
  generation: { type: string } | null;
};
type Run = { userId: string; type: string; status: string; createdAt: Date };
type Where = {
  userId: string;
  status: string;
  kind?: { in: string[] };
  createdAt?: { gte: Date };
};

const entry = (kind: string, amount: number, over: Partial<Entry> = {}): Entry => ({
  userId: "u1",
  kind,
  status: "CONFIRMED",
  amount,
  createdAt: daysAgo(1),
  generation: null,
  ...over,
});
const run = (type: string, over: Partial<Run> = {}): Run => ({
  userId: "u1",
  type,
  status: "SUCCEEDED",
  createdAt: daysAgo(1),
  ...over,
});

/** A fake database that applies the filters the service sends. */
function setup(entries: Entry[], runs: Run[]) {
  const within = (row: { userId: string; status: string; createdAt: Date }, where: Where) =>
    row.userId === where.userId &&
    row.status === where.status &&
    (!where.createdAt || row.createdAt >= where.createdAt.gte);
  const picked = (where: Where) =>
    entries.filter((row) => within(row, where) && where.kind!.in.includes(row.kind));
  const db = {
    studioLedgerEntry: {
      findMany: vi.fn(({ where }: { where: Where }) => Promise.resolve(picked(where))),
      groupBy: vi.fn(({ where }: { where: Where }) => {
        const kinds = [...new Set(picked(where).map((row) => row.kind))];
        return Promise.resolve(
          kinds.map((kind) => ({
            kind,
            _sum: {
              amount: picked(where)
                .filter((row) => row.kind === kind)
                .reduce((total, row) => total + row.amount, 0),
            },
          })),
        );
      }),
    },
    generation: {
      groupBy: vi.fn(({ where }: { where: Where }) => {
        const rows = runs.filter((row) => within(row, where));
        return Promise.resolve(
          [...new Set(rows.map((row) => row.type))].map((type) => ({
            type,
            _count: { _all: rows.filter((row) => row.type === type).length },
          })),
        );
      }),
    },
    activityLog: { create: vi.fn().mockResolvedValue({}) },
  };
  return { ctx: { db: db as unknown as Db }, db };
}

const image = { generation: { type: "IMAGE" } };
const music = { generation: { type: "MUSIC" } };

describe("your Studio usage", () => {
  it("counts coins spent after refunds, and only settled entries", async () => {
    const { ctx } = setup(
      [
        entry("SPEND", -10, image),
        entry("SPEND", -40, music),
        entry("REFUND", 40, music),
        entry("SPEND", -25, music),
        entry("SPEND", -99, { ...image, status: "PENDING" }),
        entry("SPEND", -99, { ...image, status: "FAILED" }),
        entry("SPEND", -99, { ...image, userId: "someone-else" }),
      ],
      [],
    );
    const usage = await studioUsage(ctx, "u1", { now });
    expect(usage.spent).toBe(35);
    expect(usage.byTool).toEqual([
      { type: "MUSIC", creations: 0, spent: 25 },
      { type: "IMAGE", creations: 0, spent: 10 },
    ]);
  });

  it("keeps top-ups, bonus coins and carried-over coins apart", async () => {
    const { ctx } = setup(
      [
        entry("DEPOSIT", 500),
        entry("DEPOSIT", 100),
        entry("BONUS", 50),
        entry("MIGRATED", 900),
        entry("DEPOSIT", 700, { status: "PENDING" }),
      ],
      [],
    );
    expect(await studioUsage(ctx, "u1", { now })).toMatchObject({ bought: 600, bonus: 50 });
  });

  it("counts only runs that finished, each under its tool, most coins first", async () => {
    const { ctx } = setup(
      [entry("SPEND", -5, image), entry("SPEND", -30, { generation: { type: "VIDEO" } })],
      [
        run("IMAGE"),
        run("IMAGE"),
        run("IMAGE", { status: "FAILED" }),
        run("VIDEO"),
        run("TEXT"),
        run("MUSIC", { status: "RUNNING" }),
        run("SEO", { userId: "someone-else" }),
      ],
    );
    const usage = await studioUsage(ctx, "u1", { now });
    expect(usage.creations).toBe(4);
    expect(usage.byTool).toEqual([
      { type: "VIDEO", creations: 1, spent: 30 },
      { type: "IMAGE", creations: 2, spent: 5 },
      // free to make, or paid for outside the period
      { type: "TEXT", creations: 1, spent: 0 },
    ]);
  });

  it("covers only the chosen period, or everything when none is given", async () => {
    const old = { createdAt: daysAgo(40) };
    const { ctx } = setup(
      [
        entry("SPEND", -10, image),
        entry("SPEND", -20, { ...image, ...old }),
        entry("DEPOSIT", 100, old),
      ],
      [run("IMAGE"), run("IMAGE", old)],
    );
    expect(await studioUsage(ctx, "u1", { days: 30, now })).toMatchObject({
      spent: 10,
      bought: 0,
      creations: 1,
    });
    expect(await studioUsage(ctx, "u1", { now })).toMatchObject({
      spent: 30,
      bought: 100,
      creations: 2,
    });
  });

  it("still counts spending on a run removed from the Library, with no tool", async () => {
    const { ctx } = setup([entry("SPEND", -12), entry("SPEND", -3, image)], []);
    expect((await studioUsage(ctx, "u1", { now })).byTool).toEqual([
      { type: null, creations: 0, spent: 12 },
      { type: "IMAGE", creations: 0, spent: 3 },
    ]);
  });

  it("is zeros for someone who never used Studio, and needs a sign-in", async () => {
    expect(await studioUsage(setup([], []).ctx, "u1", { now })).toEqual({
      spent: 0,
      bought: 0,
      bonus: 0,
      creations: 0,
      byTool: [],
    });
    const callerFor = (user: SessionUser | null) =>
      createCallerFactory(studioRouter)(
        createContext({
          db: setup([entry("DEPOSIT", 100, { userId: "u9" })], []).ctx.db,
          chain: {} as ChainGateway,
          app: "studio",
          session: user ? { user } : null,
        }),
      );
    await expect(callerFor(null).coins.usage({})).rejects.toThrow();
    const mine = callerFor({ id: "u9", role: "FAN", walletAddress: "G9", walletType: "email" });
    await expect(mine.coins.usage({ days: 30 })).resolves.toMatchObject({ bought: 100 });
    await expect(mine.coins.usage({ days: 45 as never })).rejects.toThrow();
  });
});
