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

/**
 * What Studio sells, each with its own provider cost. Music has three: a ~30 s
 * clip (Lyria 3 Clip), a full song (Lyria 3 Pro) and live streaming (Lyria
 * RealTime), which is priced per started minute.
 */
export const STUDIO_TOOLS = [
  "TEXT",
  "IMAGE",
  "VIDEO",
  "SEO",
  "SOCIAL",
  "MUSIC_CLIP",
  "MUSIC_SONG",
  "MUSIC_LIVE",
] as const;
export type StudioTool = (typeof STUDIO_TOOLS)[number];

/**
 * What one run costs at the provider, in USD, until an admin sets real figures.
 * Lyria: $0.04 a clip and $0.08 a song (Gemini API price list, Nov 2026);
 * RealTime has no published price yet, so its minute is a placeholder.
 */
export const DEFAULT_API_COST_USD: Record<StudioTool, number> = {
  TEXT: 0.003,
  IMAGE: 0.04,
  VIDEO: 0.5,
  SEO: 0.003,
  SOCIAL: 0.003,
  MUSIC_CLIP: 0.04,
  MUSIC_SONG: 0.08,
  MUSIC_LIVE: 0.05,
};

export type StudioPricing = {
  feePercent: number;
  apiCostUsd: Record<StudioTool, number>;
};

/** Saved settings over the defaults; anything missing or odd falls back. */
export function pricingOf(saved: unknown): StudioPricing {
  const raw = (saved ?? {}) as { feePercent?: unknown; apiCostUsd?: Record<string, unknown> };
  const fee = Number(raw.feePercent);
  const apiCostUsd = { ...DEFAULT_API_COST_USD };
  for (const type of STUDIO_TOOLS) {
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
    STUDIO_TOOLS.map((tool) => [
      tool,
      generationCoins(pricing.apiCostUsd[tool], pricing.feePercent),
    ]),
  ) as Record<StudioTool, number>;
}

export const coinsForUsd = (usd: number) => Math.round(usd / COIN_USD);

export async function loadPricing(ctx: Pick<Context, "db">) {
  const settings = await ctx.db.appSetting.findUnique({
    where: { id: 1 },
    select: { studioPrices: true },
  });
  return pricingOf(settings?.studioPrices);
}
