import type { Context } from "../../context";
import type { GenerateInput } from "./generate-input";
import { checkOptions, MODELS, providerReady } from "./models";

/**
 * Studio coins are dollars: one coin is one cent. A generation costs what the
 * AI provider charges (set per model in Admin › Settings, times what the run's
 * options ask for) plus the platform fee, rounded up to whole coins. Top-ups buy coins at face value;
 * packages add bonus coins on top.
 */
export const COIN_USD = 0.01;
export const MIN_TOP_UP_USD = 1;
export const MAX_TOP_UP_USD = 500;
export const DEFAULT_FEE_PERCENT = 30;

/**
 * What Studio sells, each with its own provider cost: every image, video and
 * writing model (services/studio/models), and music's three: a ~30 s clip
 * (Lyria 3 Clip), a full song (Lyria 3 Pro) and live streaming (Lyria
 * RealTime), priced per started minute.
 */
export const MUSIC_TOOLS = ["MUSIC_CLIP", "MUSIC_SONG", "MUSIC_LIVE"] as const;
export type MusicTool = (typeof MUSIC_TOOLS)[number];
/** Every key with a provider cost: model ids, then the music tools. */
export const PRICE_KEYS: readonly string[] = [...MODELS.map((model) => model.id), ...MUSIC_TOOLS];

/**
 * What one unit costs at the provider, in USD, until an admin sets real
 * figures: each model's catalog cost, and Lyria $0.04 a clip and $0.08 a song
 * (Gemini API price list, Nov 2026); RealTime has no published price yet, so
 * its minute is a placeholder.
 */
export const DEFAULT_API_COST_USD: Record<string, number> = {
  ...Object.fromEntries(MODELS.map((model) => [model.id, model.costUsd])),
  MUSIC_CLIP: 0.04,
  MUSIC_SONG: 0.08,
  MUSIC_LIVE: 0.05,
};

export type StudioPricing = {
  feePercent: number;
  apiCostUsd: Record<string, number>;
};

/** Saved settings over the defaults; anything missing or odd falls back. */
export function pricingOf(saved: unknown): StudioPricing {
  const raw = (saved ?? {}) as { feePercent?: unknown; apiCostUsd?: Record<string, unknown> };
  const fee = Number(raw.feePercent);
  const apiCostUsd = { ...DEFAULT_API_COST_USD };
  for (const key of PRICE_KEYS) {
    const cost = Number(raw.apiCostUsd?.[key]);
    if (raw.apiCostUsd?.[key] !== undefined && Number.isFinite(cost) && cost >= 0)
      apiCostUsd[key] = cost;
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

/** Music's prices in coins (a clip, a song, a live minute), as its buttons show them. */
export function musicPrices(pricing: StudioPricing) {
  return Object.fromEntries(
    MUSIC_TOOLS.map((tool) => [
      tool,
      generationCoins(pricing.apiCostUsd[tool]!, pricing.feePercent),
    ]),
  ) as Record<MusicTool, number>;
}

const factorOf = (choices: readonly { id: string; factor: number }[] | undefined, id?: string) =>
  (id ? choices?.find((choice) => choice.id === id) : choices?.[0])?.factor ?? 1;

/** What one run costs in coins: the model's API cost × what the options ask for, plus the fee. */
export function runPrice(input: GenerateInput, pricing: StudioPricing) {
  const model = checkOptions(input);
  const unit = pricing.apiCostUsd[model.id] ?? model.costUsd;
  let usd = unit;
  if (input.tool === "IMAGE") {
    const option = model.sizes
      ? factorOf(model.sizes, input.size)
      : factorOf(model.qualities, input.quality ?? "medium");
    usd = unit * option * input.count;
  }
  if (input.tool === "VIDEO") usd = unit * factorOf(model.resolutions, input.resolution);
  return generationCoins(usd, pricing.feePercent);
}

/**
 * The catalog as the screens show it: each model's options, its price for one
 * plain run, and whether its provider is set up (`available`).
 */
export function catalog(
  pricing: StudioPricing,
  env: Record<string, string | undefined> = process.env,
) {
  return MODELS.map((model) => ({
    ...model,
    available: providerReady(model.provider, env),
    coins: generationCoins(pricing.apiCostUsd[model.id] ?? model.costUsd, pricing.feePercent),
  }));
}

export const coinsForUsd = (usd: number) => Math.round(usd / COIN_USD);

export async function loadPricing(ctx: Pick<Context, "db">) {
  const settings = await ctx.db.appSetting.findUnique({
    where: { id: 1 },
    select: { studioPrices: true },
  });
  return pricingOf(settings?.studioPrices);
}
