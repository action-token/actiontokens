import { describe, expect, it } from "vitest";

import {
  coinsForUsd,
  DEFAULT_API_COST_USD,
  generationCoins,
  priceList,
  pricingOf,
} from "../services/studio/pricing";

describe("Studio pricing", () => {
  it("prices a run at the API cost plus the platform fee, in whole cents", () => {
    expect(generationCoins(0.04, 30)).toBe(6); // $0.052 → 6 coins
    expect(generationCoins(0.04, 20)).toBe(5); // $0.048 → 5 coins
    expect(generationCoins(0.5, 30)).toBe(65); // $0.65, exact
    expect(generationCoins(0.003, 30)).toBe(1); // never below one coin
    expect(generationCoins(0, 30)).toBe(1);
  });

  it("reads saved settings over the defaults, ignoring odd values", () => {
    expect(pricingOf(null)).toEqual({ feePercent: 30, apiCostUsd: DEFAULT_API_COST_USD });
    // The old seed format (coins per type) isn't pricing: it falls back.
    expect(pricingOf({ TEXT: 1, IMAGE: 5 })).toEqual(pricingOf(null));
    const saved = pricingOf({ feePercent: 50, apiCostUsd: { IMAGE: 0.02, VIDEO: -1 } });
    expect(saved.feePercent).toBe(50);
    expect(saved.apiCostUsd.IMAGE).toBe(0.02);
    expect(saved.apiCostUsd.VIDEO).toBe(DEFAULT_API_COST_USD.VIDEO);
  });

  it("lists every tool's price and turns dollars into coins", () => {
    expect(priceList(pricingOf(null))).toEqual({
      TEXT: 1,
      IMAGE: 6,
      MUSIC: 26,
      VIDEO: 65,
      SEO: 1,
      SOCIAL: 1,
    });
    expect(coinsForUsd(9)).toBe(900);
    expect(coinsForUsd(0.29)).toBe(29);
  });
});
