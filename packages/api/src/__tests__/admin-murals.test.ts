import { describe, expect, it, vi } from "vitest";

import type { Db } from "@actiontokens/db";

import {
  borderline,
  decideMural,
  editMural,
  mergeMurals,
  revokePreview,
  updateMuralSettings,
} from "../services/admin/murals";

type Row = Record<string, unknown>;

/** A mural with its coin ledger; `$transaction` just runs against the same fake. */
function setup(
  over: {
    mural?: Row | null;
    ledger?: { userId: string; reason: string; amount: number }[];
    balances?: Record<string, number>;
  } = {},
) {
  const ledger = [...(over.ledger ?? [])];
  const balances = { ...(over.balances ?? {}) };
  const murals: Record<string, Row> = {
    m1: {
      id: "m1",
      status: "PENDING",
      rejectReason: null,
      mergedIntoId: null,
      title: null,
      artistName: null,
      ...over.mural,
    },
    m2: {
      id: "m2",
      status: "DISCOVERED",
      rejectReason: null,
      mergedIntoId: null,
      title: "Old wall",
      artistName: "Ana",
    },
  };
  const updates: { id: string; data: Row }[] = [];
  const db = {
    mural: {
      findUnique: vi.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(over.mural === null ? null : (murals[where.id] ?? null)),
      ),
      update: vi.fn((args: { where: { id: string }; data: Row }) => {
        updates.push({ id: args.where.id, data: args.data });
        return Promise.resolve({});
      }),
    },
    coinLedgerEntry: {
      groupBy: vi.fn(() => {
        const sums = new Map<
          string,
          { userId: string; reason: string; _sum: { amount: number } }
        >();
        for (const entry of ledger) {
          const key = `${entry.userId}:${entry.reason}`;
          const row = sums.get(key) ?? {
            userId: entry.userId,
            reason: entry.reason,
            _sum: { amount: 0 },
          };
          row._sum.amount += entry.amount;
          sums.set(key, row);
        }
        return Promise.resolve([...sums.values()]);
      }),
      create: vi.fn((args: { data: { userId: string; reason: string; amount: number } }) => {
        ledger.push(args.data);
        return Promise.resolve({});
      }),
      updateMany: vi.fn().mockResolvedValue({}),
    },
    coinBalance: {
      findUnique: vi.fn(({ where }: { where: { userId: string } }) =>
        Promise.resolve(where.userId in balances ? { balance: balances[where.userId] } : null),
      ),
      upsert: vi.fn(
        (args: { where: { userId: string }; update: { balance: { increment: number } } }) => {
          balances[args.where.userId] =
            (balances[args.where.userId] ?? 0) + args.update.balance.increment;
          return Promise.resolve({ balance: balances[args.where.userId] });
        },
      ),
    },
    muralScan: {
      findFirst: vi.fn().mockResolvedValue({ id: "s1" }),
      updateMany: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([{ userId: "u1" }, { userId: "u2" }, { userId: "u3" }]),
      count: vi.fn().mockResolvedValue(5),
    },
    muralEmbedding: { updateMany: vi.fn().mockResolvedValue({}) },
    muralSettings: {
      upsert: vi.fn((args: { create?: Row }) =>
        Promise.resolve({ id: 1, confirmationsNeeded: 3, ...args.create }),
      ),
    },
    $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(db)),
  };
  const activity = { set: vi.fn() };
  return {
    ctx: { db: db as unknown as Db, activity, adminId: "admin1" } as never,
    db,
    activity,
    updates,
    ledger,
    balances,
  };
}

const earned = [
  { userId: "u1", reason: "MURAL_SCAN", amount: 10 },
  { userId: "u1", reason: "MURAL_DISCOVERY", amount: 50 },
  { userId: "u2", reason: "MURAL_SCAN", amount: 10 },
];

describe("decideMural", () => {
  it("asks why before rejecting", async () => {
    const { ctx } = setup();
    await expect(decideMural(ctx, { muralId: "m1", status: "REJECTED" })).rejects.toThrow(/reason/);
  });

  it("approves and records who decided", async () => {
    const { ctx, updates, activity } = setup();
    await decideMural(ctx, { muralId: "m1", status: "APPROVED" });
    expect(updates[0]?.data).toMatchObject({
      status: "APPROVED",
      rejectReason: null,
      decidedById: "admin1",
    });
    expect(activity.set).toHaveBeenCalledWith({ targetType: "Mural", targetId: "m1" });
  });

  it("leaves coins alone when it is just not a mural", async () => {
    const { ctx, ledger } = setup({ ledger: earned, balances: { u1: 60, u2: 10 } });
    await expect(
      decideMural(ctx, { muralId: "m1", status: "REJECTED", reason: "NOT_A_MURAL" }),
    ).resolves.toEqual({ revoked: { users: 0, coins: 0 } });
    expect(ledger).toHaveLength(earned.length);
  });

  it("takes coins back on fraud, never below what they hold", async () => {
    const { ctx, balances } = setup({ ledger: earned, balances: { u1: 20, u2: 10 } });
    const { revoked } = await decideMural(ctx, {
      muralId: "m1",
      status: "REJECTED",
      reason: "FRAUD",
    });
    expect(revoked).toEqual({ users: 2, coins: 30 });
    expect(balances).toEqual({ u1: 0, u2: 0 });
  });

  it("gives back exactly what was taken when fraud is undone", async () => {
    const { ctx, balances } = setup({ ledger: earned, balances: { u1: 20, u2: 10 } });
    await decideMural(ctx, { muralId: "m1", status: "REJECTED", reason: "FRAUD" });
    (ctx as unknown as { db: { mural: { findUnique: unknown } } }).db.mural.findUnique = vi
      .fn()
      .mockResolvedValue({ status: "REJECTED", rejectReason: "FRAUD", mergedIntoId: null });
    await decideMural(ctx, { muralId: "m1", status: "PENDING" });
    expect(balances).toEqual({ u1: 20, u2: 10 });
  });

  it("won't touch a mural that was merged away or is missing", async () => {
    const { ctx } = setup({ mural: null });
    await expect(decideMural(ctx, { muralId: "m1", status: "APPROVED" })).rejects.toThrow(
      /Mural not found/,
    );
  });
});

describe("revokePreview", () => {
  it("counts what a fraud rejection would take back", async () => {
    const { ctx } = setup({
      ledger: [...earned, { userId: "u2", reason: "MURAL_REVOKE", amount: -10 }],
    });
    await expect(revokePreview(ctx, "m1")).resolves.toEqual({ users: 1, coins: 60 });
  });
});

describe("editMural", () => {
  it("clears an empty title and artist", async () => {
    const { ctx, updates } = setup();
    await editMural(ctx, { muralId: "m1", title: "  ", artistName: "" });
    expect(updates[0]?.data).toEqual({ title: null, artistName: null });
  });

  it("only takes a cover from the mural's own scans", async () => {
    const { ctx, db } = setup();
    db.muralScan.findFirst.mockResolvedValue(null);
    await expect(
      editMural(ctx, { muralId: "m1", title: null, artistName: null, coverUrl: "https://x/y.jpg" }),
    ).rejects.toThrow(/from this mural's scans/);
  });
});

describe("mergeMurals", () => {
  it("moves scans and coins across and sends it to review once enough people found it", async () => {
    const { ctx, db, updates } = setup({ mural: { status: "DISCOVERED" } });
    await mergeMurals(ctx, { fromId: "m2", intoId: "m1" });
    expect(db.muralScan.updateMany).toHaveBeenCalledWith({
      where: { muralId: "m2" },
      data: { muralId: "m1" },
    });
    expect(db.coinLedgerEntry.updateMany).toHaveBeenCalled();
    expect(updates[0]).toMatchObject({
      id: "m1",
      data: {
        distinctScanners: 3,
        scanCount: 5,
        title: "Old wall",
        artistName: "Ana",
        status: "PENDING",
      },
    });
    expect(updates[1]).toMatchObject({ id: "m2", data: { mergedIntoId: "m1", scanCount: 0 } });
  });

  it("refuses to merge a mural into itself", async () => {
    const { ctx } = setup();
    await expect(mergeMurals(ctx, { fromId: "m1", intoId: "m1" })).rejects.toThrow(
      /different mural/,
    );
  });
});

describe("updateMuralSettings", () => {
  const ok = {
    coinsPerScan: 10,
    discoveryBonus: 50,
    dailyScansPerMural: 3,
    confirmationsNeeded: 3,
  };

  it("saves valid rules with the admin's id", async () => {
    const { ctx, db } = setup();
    await updateMuralSettings(ctx, ok);
    expect(db.muralSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { ...ok, updatedById: "admin1" } }),
    );
  });

  it("refuses numbers out of range or fractions", async () => {
    const { ctx } = setup();
    await expect(updateMuralSettings(ctx, { ...ok, confirmationsNeeded: 0 })).rejects.toThrow(
      /Finders before review/,
    );
    await expect(updateMuralSettings(ctx, { ...ok, coinsPerScan: 1.5 })).rejects.toThrow(
      /Coins per scan/,
    );
  });
});

describe("borderline", () => {
  it("flags a possible screen or weak art scores, not skipped checks", () => {
    expect(borderline({ screens: [{ name: "Television", score: 0.4, area: 0.1 }] })).toBe(true);
    expect(borderline({ clip: [{ score: 0.5 }, { score: 0.6 }] })).toBe(true);
    expect(borderline({ clip: [{ score: 0.9 }] })).toBe(false);
    expect(borderline({ skipped: true, clip: [{ score: 0.1 }] })).toBe(false);
  });
});
