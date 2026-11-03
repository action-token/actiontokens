import { describe, expect, it, vi } from "vitest";

import { saveStudioPackage, updateStudioPricing } from "../services/admin/studio";
import { DEFAULT_API_COST_USD } from "../services/studio/pricing";

function setup() {
  const tx = {
    studioPackage: {
      updateMany: vi.fn().mockResolvedValue({ count: 2 }),
      create: vi.fn().mockResolvedValue({ id: "p9" }),
      findUnique: vi.fn().mockResolvedValue({ id: "p1" }),
      update: vi.fn().mockResolvedValue({ id: "p1" }),
    },
  };
  const db = {
    ...tx,
    studioPackage: { ...tx.studioPackage, findMany: vi.fn().mockResolvedValue([]) },
    appSetting: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn((run: (client: unknown) => unknown) => run(tx)),
  };
  return { ctx: { db, activity: { set: vi.fn() } } as never, db, tx };
}

const pack = {
  name: "Creator",
  priceUsd: 9,
  bonusCoins: 100,
  isPopular: true,
  isActive: true,
  sortOrder: 1,
};

describe("Admin › Studio", () => {
  it("prices a package in dollars, its coins at a cent each, and keeps one popular", async () => {
    const { ctx, tx } = setup();
    await saveStudioPackage(ctx, pack);
    expect(tx.studioPackage.updateMany).toHaveBeenCalledWith({
      where: {},
      data: { isPopular: false },
    });
    expect(tx.studioPackage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ priceUsd: 9, coins: 900, bonusCoins: 100 }),
      select: { id: true },
    });
  });

  it("refuses odd prices and bonuses bigger than the package", async () => {
    const { ctx } = setup();
    await expect(saveStudioPackage(ctx, { ...pack, priceUsd: 0.5 })).rejects.toThrow(
      /between \$1 and \$500/,
    );
    await expect(saveStudioPackage(ctx, { ...pack, bonusCoins: 5000 })).rejects.toThrow(
      /bonus can't be more/,
    );
  });

  it("saves the API costs and fee, and the prices follow", async () => {
    const { ctx, db } = setup();
    db.appSetting.findUnique.mockResolvedValue({
      studioPrices: { feePercent: 30, apiCostUsd: { ...DEFAULT_API_COST_USD, IMAGE: 0.1 } },
    });
    const saved = await updateStudioPricing(ctx, {
      feePercent: 30,
      apiCostUsd: { ...DEFAULT_API_COST_USD, IMAGE: 0.1 },
    });
    expect(db.appSetting.upsert).toHaveBeenCalled();
    expect(saved.prices.IMAGE).toBe(13);
  });
});
