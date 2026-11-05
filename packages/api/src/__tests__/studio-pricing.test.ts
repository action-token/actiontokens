import { describe, expect, it } from "vitest";

import {
  catalog,
  coinsForUsd,
  DEFAULT_API_COST_USD,
  generationCoins,
  musicPrices,
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
    const saved = pricingOf({
      feePercent: 50,
      apiCostUsd: { "gpt-6-luna": 0.02, "gemini-omni-1.1-flash": -1, "not-a-model": 9 },
    });
    expect(saved.feePercent).toBe(50);
    expect(saved.apiCostUsd["gpt-6-luna"]).toBe(0.02);
    expect(saved.apiCostUsd["gemini-omni-1.1-flash"]).toBe(
      DEFAULT_API_COST_USD["gemini-omni-1.1-flash"],
    );
    expect(saved.apiCostUsd["not-a-model"]).toBeUndefined();
  });

  it("prices every model and music, and turns dollars into coins", () => {
    const pricing = pricingOf(null);
    expect(musicPrices(pricing)).toEqual({ MUSIC_CLIP: 6, MUSIC_SONG: 11, MUSIC_LIVE: 7 });
    const coins = Object.fromEntries(catalog(pricing).map((model) => [model.id, model.coins]));
    expect(coins).toMatchObject({
      "gemini-nano-banana-2.1": 5,
      "gemini-3-pro-image": 18,
      "gemini-omni-1.1-flash": 104,
      "gemini-3.8-flash": 1,
    });
    expect(coinsForUsd(9)).toBe(900);
    expect(coinsForUsd(0.29)).toBe(29);
  });
});
