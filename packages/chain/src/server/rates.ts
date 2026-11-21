import { AppError, ErrorCodes } from "@actiontokens/errors";

/**
 * USD per XLM and per USDC, for quotes. Cached for the quote lifetime so a
 * quote and the transaction built from it use the same numbers.
 */
const CACHE_TTL_MS = 60_000;
const TIMEOUT_MS = 8000;

export type Rates = { xlmUsd: string; usdcUsd: string };
type Fetcher = (url: string) => Promise<unknown>;

const defaultFetcher: Fetcher = async (url) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok)
    throw new AppError(ErrorCodes.EXTERNAL_SERVICE_FAILED, {
      details: { url, status: response.status },
    });
  return response.json();
};

let cache: { rates: Rates; at: number } | null = null;
let actionTokenCache: { price: string; at: number } | null = null;
export const clearRateCache = () => {
  cache = null;
  actionTokenCache = null;
};

const usable = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

/** Live rates: Stellar Expert first, Binance if it is down. USDC is taken at $1. */
export async function liveRates(
  fetcher: Fetcher = defaultFetcher,
  now = Date.now(),
): Promise<Rates> {
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.rates;

  const xlmUsd = (await fromStellarExpert(fetcher)) ?? (await fromBinance(fetcher));
  if (xlmUsd === null) {
    throw new AppError(ErrorCodes.EXTERNAL_SERVICE_FAILED, {
      message: "Couldn't load the XLM price. Pay with ACTION, or try again in a moment.",
    });
  }
  const rates = { xlmUsd: xlmUsd.toFixed(7), usdcUsd: "1" };
  cache = { rates, at: now };
  return rates;
}

async function fromStellarExpert(fetcher: Fetcher) {
  try {
    const data = (await fetcher("https://api.stellar.expert/explorer/public/asset/XLM")) as {
      price?: unknown;
    };
    return usable(data.price) ? data.price : null;
  } catch {
    return null;
  }
}

async function fromBinance(fetcher: Fetcher) {
  try {
    const data = (await fetcher("https://api.binance.com/api/v3/avgPrice?symbol=XLMUSDT")) as {
      price?: unknown;
    };
    const price = Number.parseFloat(String(data.price));
    return usable(price) ? price : null;
  } catch {
    return null;
  }
}

/** USD per ACTION on testnet, where the test asset has no market: the old Action Tokens' price. */
export const TESTNET_ACTION_USD = "0.00231";

/**
 * USD per ACTION. On mainnet, only the asset's market price from Stellar
 * Expert; with no price, or no answer, it refuses rather than guessing. On
 * testnet the fixed `TESTNET_ACTION_USD`, and the market is never asked.
 */
export async function liveActionTokenUsd(
  input: { name: "mainnet" | "testnet"; asset: { code: string; issuer: string } },
  fetcher: Fetcher = defaultFetcher,
  now = Date.now(),
): Promise<string> {
  if (input.name === "testnet") return Number.parseFloat(TESTNET_ACTION_USD).toFixed(7);
  if (actionTokenCache && now - actionTokenCache.at < CACHE_TTL_MS) return actionTokenCache.price;

  let price: number | null = null;
  try {
    const data = (await fetcher(
      `https://api.stellar.expert/explorer/public/asset/${input.asset.code}-${input.asset.issuer}`,
    )) as { price?: unknown };
    price = usable(data.price) ? data.price : null;
  } catch {
    price = null;
  }
  if (price === null) {
    throw new AppError(ErrorCodes.EXTERNAL_SERVICE_FAILED, {
      message: "Couldn't load the ACTION price. Try again in a moment.",
    });
  }
  actionTokenCache = { price: price.toFixed(7), at: now };
  return actionTokenCache.price;
}
