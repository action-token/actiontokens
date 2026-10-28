import type { Currency, OnChainCurrency } from "../currency";
import { applyBps, sum, toAmount, toDisplay, toStroops, usdTo } from "../money";

/**
 * The price breakdown for any payment. Pure: the server feeds it prices,
 * live rates and the buyer's balances; the UI only displays what comes back.
 *
 * Rules it enforces:
 * - The artist sets two prices: BANDCOIN and USD. XLM and USDC are worked
 *   out from USD at the live rate. Card charges the USD price.
 * - Nothing is ever converted. If the buyer is short in the currency they
 *   chose, the quote says how much is missing.
 * - The buyer pays every cost: price, platform fee, trustline reserve and the
 *   network fee. The platform account never fronts anything.
 */

/** XLM a new trustline locks in the buyer's account (refundable). */
export const TRUSTLINE_RESERVE_XLM = "0.5";
/** How long a quote, and the transaction built from it, stays valid. */
export const QUOTE_TTL_SECONDS = 60;

export type QuoteInput = {
  currency: Currency;
  quantity: number;
  /** Price of one copy, as the artist set it */
  unitPrice: { bandcoin: string; usd: string };
  /** USD per XLM and per USDC, from the live feed (only the one being paid in is needed) */
  rates: { xlmUsd?: string; usdcUsd?: string };
  platformFeeBps: number;
  /** Resales: the creator's cut, taken out of the seller's share */
  royaltyBps?: number;
  /** Trustlines the buyer's account must open first */
  newTrustlines: number;
  /** Fee for the whole transaction, in XLM */
  networkFeeXlm: string;
  /** Spendable balances (XLM net of reserves); null when signed out */
  funds: Record<OnChainCurrency, string> | null;
  now: Date;
};

export type QuoteLineKey = "price" | "platformFee" | "reserve" | "networkFee";

export type QuoteLine = {
  key: QuoteLineKey;
  label: string;
  /** e.g. "2 × 10 BANDCOIN" or "2.5 %" */
  detail?: string;
  hint?: string;
  amount: string;
  currency: Currency;
};

export type Shortfall = { currency: OnChainCurrency; need: string; have: string; short: string };

export type QuoteProblem =
  | { code: "SIGN_IN"; message: string }
  /** Added by services: sold out, seller can't receive this currency… */
  | { code: "UNAVAILABLE"; message: string }
  | { code: "INSUFFICIENT_FUNDS"; message: string; shortfall: Shortfall };

export type Quote = {
  currency: Currency;
  quantity: number;
  unitPrice: string;
  /** USD per unit of `currency`; null for BANDCOIN, which has its own price */
  rateUsd: string | null;
  lines: QuoteLine[];
  /** What the buyer pays, one entry per currency ("20.5 BANDCOIN + 0.50001 XLM") */
  totals: { currency: Currency; amount: string }[];
  /** Where the money goes, in `currency` */
  payout: { seller: string; royalty: string; platform: string };
  ok: boolean;
  problems: QuoteProblem[];
  expiresAt: string;
};

export function buildQuote(input: QuoteInput): Quote {
  if (!Number.isInteger(input.quantity) || input.quantity < 1) {
    throw new RangeError("Quantity must be a whole number of at least 1");
  }

  const { currency, quantity } = input;
  const rateUsd = rateFor(currency, input.rates);
  const unit = unitPriceIn(currency, input.unitPrice, rateUsd);
  // Convert the whole line, not one copy, so rounding happens once.
  const price =
    rateUsd === null || currency === "USD"
      ? unit * BigInt(quantity)
      : usdTo(toStroops(input.unitPrice.usd) * BigInt(quantity), rateUsd);
  const platformFee = applyBps(price, input.platformFeeBps);
  const royalty = applyBps(price, input.royaltyBps ?? 0);
  const reserve = toStroops(TRUSTLINE_RESERVE_XLM) * BigInt(input.newTrustlines);
  const networkFee = toStroops(input.networkFeeXlm);

  const lines: QuoteLine[] = [
    {
      key: "price",
      label: "Item price",
      detail: `${quantity} × ${toDisplay(unit)} ${unitLabel(currency)}`,
      amount: toAmount(price),
      currency,
    },
    {
      key: "platformFee",
      label: "Platform fee",
      detail: `${input.platformFeeBps / 100} %`,
      amount: toAmount(platformFee),
      currency,
    },
  ];
  if (reserve > 0n) {
    lines.push({
      key: "reserve",
      label: "Trustline",
      detail: "first time only",
      hint: "Reserve that lets your wallet hold this item. It stays yours and comes back if you remove the trustline.",
      amount: toAmount(reserve),
      currency: "XLM",
    });
  }
  lines.push({ key: "networkFee", label: "Network fee", amount: toAmount(networkFee), currency: "XLM" });

  const totals = totalsOf(lines);
  const problems = findProblems(input, totals);

  return {
    currency,
    quantity,
    unitPrice: toAmount(unit),
    rateUsd: rateUsd === null || currency === "USD" ? null : toAmount(rateUsd),
    lines,
    totals: [...totals].map(([lineCurrency, amount]) => ({ currency: lineCurrency, amount: toAmount(amount) })),
    payout: {
      seller: toAmount(price - royalty),
      royalty: toAmount(royalty),
      platform: toAmount(platformFee),
    },
    ok: problems.length === 0,
    problems,
    expiresAt: new Date(input.now.getTime() + QUOTE_TTL_SECONDS * 1000).toISOString(),
  };
}

function rateFor(currency: Currency, rates: QuoteInput["rates"]): bigint | null {
  if (currency === "XLM") return toStroops(required(rates.xlmUsd, "XLM"));
  if (currency === "USDC") return toStroops(required(rates.usdcUsd, "USDC"));
  if (currency === "USD") return toStroops(1);
  return null;
}

function required(rate: string | undefined, currency: string) {
  if (rate === undefined) throw new RangeError(`A ${currency} quote needs the USD per ${currency} rate`);
  return rate;
}

function unitPriceIn(currency: Currency, unitPrice: QuoteInput["unitPrice"], rateUsd: bigint | null) {
  if (currency === "BANDCOIN") return toStroops(unitPrice.bandcoin);
  if (currency === "USD") return toStroops(unitPrice.usd);
  return usdTo(toStroops(unitPrice.usd), rateUsd!);
}

const unitLabel = (currency: Currency) => (currency === "USD" ? "USD" : currency);
/** Lines added up per currency, the chosen currency first. */
function totalsOf(lines: QuoteLine[]) {
  const totals = new Map<Currency, bigint>();
  for (const line of lines) {
    totals.set(line.currency, sum([totals.get(line.currency) ?? 0n, toStroops(line.amount)]));
  }
  return totals;
}

function findProblems(input: QuoteInput, totals: Map<Currency, bigint>): QuoteProblem[] {
  if (!input.funds) {
    return [{ code: "SIGN_IN", message: "Sign in to pay." }];
  }
  const problems: QuoteProblem[] = [];
  for (const [currency, need] of totals) {
    if (currency === "USD") continue;
    const have = toStroops(input.funds[currency]);
    if (have >= need) continue;
    const shortfall: Shortfall = {
      currency,
      need: toAmount(need),
      have: toAmount(have),
      short: toAmount(need - have),
    };
    problems.push({
      code: "INSUFFICIENT_FUNDS",
      message: `You're ${toDisplay(need - have)} ${currency} short.`,
      shortfall,
    });
  }
  return problems;
}
