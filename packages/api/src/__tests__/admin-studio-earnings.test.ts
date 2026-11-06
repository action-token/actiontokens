import { describe, expect, it, vi } from "vitest";

import { studioEarnings } from "../services/admin/studio-earnings";
import { MODELS } from "../services/studio/models";

const NOW = new Date("2026-11-06T12:00:00Z");
const model = MODELS[0]!;

type Entry = {
  kind: "SPEND" | "REFUND";
  amount: number;
  generation: { model: string | null; type: string } | null;
};
const spend = (key: string | null, coins: number, type = "IMAGE"): Entry => ({
  kind: "SPEND",
  amount: -coins,
  generation: { model: key, type },
});
const refund = (key: string | null, coins: number, type = "IMAGE"): Entry => ({
  kind: "REFUND",
  amount: coins,
  generation: { model: key, type },
});

function setup(
  entries: Entry[] = [],
  sums: Record<string, number> = {},
  held = 0,
  saved: unknown = null,
) {
  const db = {
    studioLedgerEntry: {
      groupBy: vi
        .fn()
        .mockResolvedValue(
          Object.entries(sums).map(([kind, amount]) => ({ kind, _sum: { amount } })),
        ),
      findMany: vi.fn().mockResolvedValue(entries),
    },
    studioBalance: { aggregate: vi.fn().mockResolvedValue({ _sum: { balance: held } }) },
    appSetting: { findUnique: vi.fn().mockResolvedValue({ studioPrices: saved }) },
  };
  return { ctx: { db } as never, db };
}

describe("Admin › Studio earnings", () => {
  it("adds up each model's runs, net of refunds, and the platform's share at the fee", async () => {
    const { ctx } = setup([spend(model.id, 13), spend(model.id, 13), refund(model.id, 13)]);
    const report = await studioEarnings(ctx, { days: 30, now: NOW });
    const row = report.models[0]!;
    expect(row).toMatchObject({
      key: model.id,
      name: model.name,
      runs: 2,
      refunds: 1,
      chargedCoins: 26,
      refundedCoins: 13,
      netCoins: 13,
    });
    // 13 coins = $0.13; at a 30% fee the provider's part is $0.10 and the platform's $0.03.
    expect(row.providerCostUsd).toBe(0.1);
    expect(row.platformUsd).toBe(0.03);
  });

  it("uses the fee saved in Admin › Settings, not a fixed one", async () => {
    const { ctx } = setup([spend(model.id, 20)], {}, 0, { feePercent: 100 });
    const report = await studioEarnings(ctx, { days: 30, now: NOW });
    expect(report.feePercent).toBe(100);
    expect(report.models[0]).toMatchObject({ providerCostUsd: 0.1, platformUsd: 0.1 });
  });

  it("names runs without a known model after their kind, and lists the biggest earner first", async () => {
    const { ctx } = setup([
      spend(null, 5, "MUSIC"),
      spend(model.id, 50),
      spend("retired-model-x", 8, "VIDEO"),
    ]);
    const report = await studioEarnings(ctx, { days: 30, now: NOW });
    expect(report.models.map((row) => row.key)).toEqual([model.id, "retired-model-x", "MUSIC"]);
    expect(report.models[1]!.name).toBe("retired-model-x");
    expect(report.models[2]!.name).toBe("Music");
  });

  it("shows money in, bonus coins given, what the platform keeps, and what it keeps after bonuses", async () => {
    const { ctx } = setup(
      [spend(model.id, 130)],
      { DEPOSIT: 2000, BONUS: 600, WITHDRAW: -100 },
      1500,
    );
    const { totals } = await studioEarnings(ctx, { days: 30, now: NOW });
    expect(totals).toEqual({
      moneyInUsd: 20,
      bonusCoins: 600,
      withdrawnCoins: 100,
      spentCoins: 130,
      providerCostUsd: 1,
      platformUsd: 0.3,
      afterBonusesUsd: -5.7,
      heldCoins: 1500,
    });
  });

  it("counts only confirmed entries, inside the chosen window", async () => {
    const { ctx, db } = setup();
    await studioEarnings(ctx, { days: 7, now: NOW });
    const since = new Date("2026-10-30T12:00:00Z");
    expect(db.studioLedgerEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: "CONFIRMED",
          kind: { in: ["SPEND", "REFUND"] },
          createdAt: { gte: since },
        },
      }),
    );
    expect(db.studioLedgerEntry.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: "CONFIRMED",
          kind: { in: ["DEPOSIT", "BONUS", "WITHDRAW"] },
          createdAt: { gte: since },
        },
      }),
    );
  });

  it("looks at everything when no window is given", async () => {
    const { ctx, db } = setup();
    const report = await studioEarnings(ctx, { now: NOW });
    expect(report.days).toBeNull();
    expect(db.studioLedgerEntry.findMany.mock.calls[0]![0].where).toEqual({
      status: "CONFIRMED",
      kind: { in: ["SPEND", "REFUND"] },
    });
  });

  it("is all zeros for an empty ledger", async () => {
    const { ctx } = setup();
    const report = await studioEarnings(ctx, { days: 30, now: NOW });
    expect(report.models).toEqual([]);
    expect(report.totals).toEqual({
      moneyInUsd: 0,
      bonusCoins: 0,
      withdrawnCoins: 0,
      spentCoins: 0,
      providerCostUsd: 0,
      platformUsd: 0,
      afterBonusesUsd: 0,
      heldCoins: 0,
    });
  });
});
