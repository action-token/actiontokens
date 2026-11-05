import { AppError, ErrorCodes } from "@bandcoin/errors";

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
let bandcoinCache: { price: string; at: number } | null = null;
export const clearRateCache = () => {
  cache = null;
  bandcoinCache = null;
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
      message: "Couldn't load the XLM price. Pay with BANDCOIN, or try again in a moment.",
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

/** USD per BANDCOIN the old Bandcoin used when the market had no price. */
export const BANDCOIN_FALLBACK_USD = "0.00231";

/**
 * USD per BANDCOIN. On mainnet, the asset's market price; when the market has
 * none (Stellar Expert prices only from exchange trades, and BANDCOIN rarely
 * trades) or can't be reached, `fallbackPrice` (BANDCOIN_USD_PRICE), else the
 * old Bandcoin's fixed price. A fallback is never cached, so the market price
 * is used again as soon as there is one. On testnet a test asset has no
 * market, so the price comes from `devPrice` (BANDCOIN_USD_PRICE) and the
 * market is never asked; a missing one is refused.
 */
export async function liveBandcoinUsd(
  input: {
    name: "mainnet" | "testnet";
    asset: { code: string; issuer: string };
    devPrice?: string;
    fallbackPrice?: string;
  },
  fetcher: Fetcher = defaultFetcher,
  now = Date.now(),
): Promise<string> {
  if (input.name === "testnet") {
    const dev = Number.parseFloat(input.devPrice ?? "");
    if (!usable(dev)) {
      throw new AppError(ErrorCodes.CONFIG_MISSING, {
        message: "BANDCOIN has no market price on testnet. Set BANDCOIN_USD_PRICE for development.",
        details: { name: "BANDCOIN_USD_PRICE" },
      });
    }
    return dev.toFixed(7);
  }
  if (bandcoinCache && now - bandcoinCache.at < CACHE_TTL_MS) return bandcoinCache.price;

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
    const fallback = Number.parseFloat(input.fallbackPrice ?? "");
    return (usable(fallback) ? fallback : Number.parseFloat(BANDCOIN_FALLBACK_USD)).toFixed(7);
  }
  bandcoinCache = { price: price.toFixed(7), at: now };
  return bandcoinCache.price;
}
