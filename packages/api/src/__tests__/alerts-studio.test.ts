import { describe, expect, it, vi } from "vitest";

import { studioBalances } from "../services/admin/alerts";

const at = new Date("2026-11-03T10:00:00Z");

function setup(balances: unknown[], ledger: unknown[]) {
  const db = {
    studioBalance: { findMany: vi.fn().mockResolvedValue(balances) },
    studioLedgerEntry: { groupBy: vi.fn().mockResolvedValue(ledger) },
  };
  return { db } as never;
}

describe("Studio balance alert", () => {
  it("stays quiet when every balance equals its records (held coins included)", async () => {
    const ctx = setup(
      [{ userId: "u1", balance: "12.5", updatedAt: at }],
      [{ userId: "u1", _sum: { amount: "12.5" }, _max: { createdAt: at } }],
    );
    expect(await studioBalances(ctx)).toEqual([]);
  });

  it("flags a balance off from its records, and records with no balance", async () => {
    const ctx = setup(
      [{ userId: "u1", balance: "15", updatedAt: at }],
      [
        { userId: "u1", _sum: { amount: "12.5" }, _max: { createdAt: at } },
        { userId: "u2", _sum: { amount: "3" }, _max: { createdAt: at } },
      ],
    );
    const alerts = await studioBalances(ctx);
    expect(alerts).toHaveLength(2);
    expect(alerts[0]).toMatchObject({
      kind: "studioBalance",
      userId: "u1",
      detail:
        "The balance shows 15 coins, but its records add up to 12.5 (+2.5). Nothing was changed.",
    });
    expect(alerts[1]).toMatchObject({ userId: "u2" });
  });
});
