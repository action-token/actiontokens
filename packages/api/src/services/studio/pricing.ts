import type { GenerationType } from "@bandcoin/db";

import type { Context } from "../../context";

/**
 * Studio coins are dollars: one coin is one cent. A generation costs what the
 * AI provider charges for one run (set per tool in Admin › Settings) plus the
 * platform fee, rounded up to whole coins. Top-ups buy coins at face value;
 * packages add bonus coins on top.
 */
export const COIN_USD = 0.01;
export const MIN_TOP_UP_USD = 1;
export const MAX_TOP_UP_USD = 500;
export const DEFAULT_FEE_PERCENT = 30;

export const GENERATION_TYPES: GenerationType[] = [
  "TEXT",
  "IMAGE",
  "MUSIC",
  "VIDEO",
  "SEO",
  "SOCIAL",
];

/** What one run costs at the provider, in USD, until an admin sets real figures. */
export const DEFAULT_API_COST_USD: Record<GenerationType, number> = {
  TEXT: 0.003,
  IMAGE: 0.04,
  MUSIC: 0.2,
  VIDEO: 0.5,
  SEO: 0.003,
  SOCIAL: 0.003,
};

export type StudioPricing = {
  feePercent: number;
  apiCostUsd: Record<GenerationType, number>;
};

/** Saved settings over the defaults; anything missing or odd falls back. */
export function pricingOf(saved: unknown): StudioPricing {
  const raw = (saved ?? {}) as { feePercent?: unknown; apiCostUsd?: Record<string, unknown> };
  const fee = Number(raw.feePercent);
  const apiCostUsd = { ...DEFAULT_API_COST_USD };
  for (const type of GENERATION_TYPES) {
    const cost = Number(raw.apiCostUsd?.[type]);
    if (Number.isFinite(cost) && cost >= 0) apiCostUsd[type] = cost;
  }
  return {
    feePercent: Number.isFinite(fee) && fee >= 0 && fee <= 500 ? fee : DEFAULT_FEE_PERCENT,
    apiCostUsd,
  };
}

/** Coins for one run: API cost plus the fee, rounded up, never below one coin. */
export function generationCoins(apiCostUsd: number, feePercent: number) {
  const usd = apiCostUsd * (1 + feePercent / 100);
  // Round away float noise before ceil (0.052 / 0.01 = 5.2000000000000002).
  return Math.max(1, Math.ceil(Math.round((usd / COIN_USD) * 1e6) / 1e6));
}

/** Every tool's price in coins, as the Generate buttons show it. */
export function priceList(pricing: StudioPricing) {
  return Object.fromEntries(
    GENERATION_TYPES.map((type) => [
      type,
      generationCoins(pricing.apiCostUsd[type], pricing.feePercent),
    ]),
  ) as Record<GenerationType, number>;
}

export const coinsForUsd = (usd: number) => Math.round(usd / COIN_USD);

export async function loadPricing(ctx: Pick<Context, "db">) {
  const settings = await ctx.db.appSetting.findUnique({
    where: { id: 1 },
    select: { studioPrices: true },
  });
  return pricingOf(settings?.studioPrices);
}
