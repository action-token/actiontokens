/**
 * What one Studio run costs, in coins (one coin = one cent): the AI provider's
 * cost plus the platform fee, rounded up, never below one coin. The same sum as
 * the server's (api services/studio/pricing), so the preview matches the price.
 */
export const coinsFor = (apiCostUsd: number, feePercent: number) =>
  Math.max(1, Math.ceil(Math.round(apiCostUsd * (1 + feePercent / 100) * 100 * 1e6) / 1e6));
