import { describe, expect, it, vi } from "vitest";

import { monthYearOf, quarterOf, rewardAssets } from "../config";
import { minimumHeld, syncOriginHolders, syncQuarterHolders } from "../sync";

const NOW = new Date("2026-11-20T10:00:00Z");
const env = {
  REWARD_ACTION_ASSET: "ACTION-GISS",
  REWARD_PLOT_ASSET: "PLOT-GISS",
  REWARD_PLOT_DISTRIBUTOR: "GDIST",
};

describe("rounds", () => {
  it("names the month and quarter", () => {
    expect(monthYearOf(NOW)).toBe("2026-11");
    expect(quarterOf(NOW)).toEqual({ year: 2026, quarter: "OCT-DEC" });
    expect(quarterOf(new Date("2026-01-01T00:00:00Z")).quarter).toBe("JAN-MAR");
  });

  it("assumes no assets on testnet", () => {
    expect(() => rewardAssets({ chain: { config: { name: "testnet" } } } as never, {})).toThrow(
      /aren't set/,
    );
    expect(rewardAssets({ chain: { config: { name: "mainnet" } } } as never, {}).action.code).toBe(
      "ACTION",
    );
  });
});

describe("minimumHeld", () => {
  const day = 86_400;
  const now = NOW.getTime();
  it("takes the lowest balance in the last 90 days, ignoring older days", () => {
    const t = now / 1000;
    expect(
      minimumHeld(
        [
          [t - 200 * day, "1"],
          [t - 30 * day, "50000000000"],
          [t - 5 * day, "20000000000"],
        ],
        now,
      ),
    ).toBe(2000);
    expect(minimumHeld([], now)).toBe(0);
  });
});

describe("syncQuarterHolders", () => {
  it("saves each holder's 90-day minimum on this quarter's round, leaving out empty ones", async () => {
    process.env.REWARD_ACTION_ASSET = env.REWARD_ACTION_ASSET;
    process.env.REWARD_PLOT_ASSET = env.REWARD_PLOT_ASSET;
    process.env.REWARD_PLOT_DISTRIBUTOR = env.REWARD_PLOT_DISTRIBUTOR;
    const upsert = vi.fn();
    const ctx = {
      db: { quarterReward: { findUnique: vi.fn().mockResolvedValue(null), upsert } },
      chain: {
        config: { name: "testnet" },
        assetHolders: vi.fn().mockResolvedValue({
          complete: true,
          holders: [
            { address: "A", balance: "1" },
            { address: "B", balance: "1" },
          ],
        }),
      },
    };
    const t = NOW.getTime() / 1000;
    const history = vi.fn(async (id: string) =>
      id === "A" ? [[t - 86_400, "30000000000"] as [number, string]] : [],
    );
    expect(await syncQuarterHolders(ctx as never, history, NOW)).toEqual({
      year: 2026,
      quarter: "OCT-DEC",
      holders: 1,
    });
    expect(upsert.mock.calls[0]![0].create.data).toEqual([{ accountId: "A", action: 3000 }]);
  });

  it("won't touch a paid round or a partial holder list", async () => {
    const paid = {
      db: { quarterReward: { findUnique: vi.fn().mockResolvedValue({ isDistributed: true }) } },
      chain: { config: { name: "testnet" } },
    };
    await expect(syncQuarterHolders(paid as never, vi.fn(), NOW)).rejects.toThrow(/already paid/);
    const partial = {
      db: { quarterReward: { findUnique: vi.fn().mockResolvedValue(null) } },
      chain: {
        config: { name: "testnet" },
        assetHolders: vi.fn().mockResolvedValue({ complete: false, holders: [] }),
      },
    };
    await expect(syncQuarterHolders(partial as never, vi.fn(), NOW)).rejects.toThrow(
      /Too many holders/,
    );
  });
});

describe("syncOriginHolders", () => {
  it("groups the plots each holder owns and keeps only people who hold PLOT", async () => {
    const upsert = vi.fn();
    const balances = (plot: string) => ({
      balances: [
        { asset_type: "credit_alphanum4", asset_code: "PLOT", asset_issuer: "GISS", balance: plot },
      ],
    });
    const ctx = {
      db: { originReward: { findUnique: vi.fn().mockResolvedValue(null), upsert } },
      chain: {
        config: { name: "testnet" },
        loadAccount: vi.fn(async (id: string) =>
          id === "GDIST"
            ? {
                balances: [
                  {
                    asset_type: "credit_alphanum12",
                    asset_code: "PLOT00001",
                    asset_issuer: "GN",
                    balance: "1",
                  },
                  {
                    asset_type: "credit_alphanum12",
                    asset_code: "PLOT00002",
                    asset_issuer: "GN",
                    balance: "1",
                  },
                  {
                    asset_type: "credit_alphanum4",
                    asset_code: "OTHER",
                    asset_issuer: "GN",
                    balance: "1",
                  },
                ],
              }
            : id === "A"
              ? balances("5")
              : balances("0"),
        ),
        assetHolders: vi.fn(async (code: string) => ({
          complete: true,
          holders:
            code === "PLOT00001"
              ? [
                  { address: "GDIST", balance: "1" },
                  { address: "A", balance: "1" },
                  { address: "B", balance: "1" },
                ]
              : [{ address: "A", balance: "1" }],
        })),
      },
    };
    expect(await syncOriginHolders(ctx as never, NOW)).toEqual({
      monthYear: "2026-11",
      holders: 1,
    });
    const data = (
      upsert.mock.calls[0]![0] as { create: { data: { plots: { asset_code: string }[] }[] } }
    ).create.data;
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({ pubkey: "A", plotBal: 5 });
    expect(data[0]!.plots.map((p) => p.asset_code)).toEqual(["PLOT00001", "PLOT00002"]);
  });
});
