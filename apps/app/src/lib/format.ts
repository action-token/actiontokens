/**
 * Display formatting for amounts that come from the server as exact decimal
 * strings. Formatting only: no money math happens in the browser.
 */

export type DisplayCurrency = "BANDCOIN" | "XLM" | "USDC" | "USD";

const DECIMALS: Record<DisplayCurrency, number> = { BANDCOIN: 2, XLM: 7, USDC: 2, USD: 2 };

/**
 * "20.5000000" → "20.5", "0.0000400" → "0.00004", 1234.5 → "1,234.5".
 * `short` rounds to 2 decimals for headlines and writes millions and up as
 * "25B"; breakdowns keep every digit.
 */
export function formatAmount(
  amount: string | number,
  currency: DisplayCurrency,
  options: { short?: boolean } = {},
) {
  const value = typeof amount === "number" ? amount : Number(amount);
  if (currency === "USD") {
    if (value > 0 && value < 0.01) return "< $0.01";
    return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
  }
  if (options.short && value >= 1_000_000) {
    return value.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 });
  }
  return value.toLocaleString("en-US", {
    maximumFractionDigits: options.short ? 2 : DECIMALS[currency],
  });
}

/** "20.5 BANDCOIN", "$5.13" */
export function formatMoney(amount: string | number, currency: DisplayCurrency) {
  const text = formatAmount(amount, currency);
  return currency === "USD" ? text : `${text} ${currency}`;
}

/** What the card is actually charged: the USD total rounded up to the cent, like the server does. */
export const cardChargeUsd = (total: string) => Math.ceil(Number(total) * 100 - 1e-9) / 100;

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["week", 604_800],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
];

/** "3 minutes ago", "in 2 days", "just now". */
export function timeAgo(date: Date | string, now = Date.now()) {
  const seconds = Math.round((new Date(date).getTime() - now) / 1000);
  const unit = UNITS.find(([, size]) => Math.abs(seconds) >= size);
  if (!unit) return "just now";
  return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(
    Math.round(seconds / unit[1]),
    unit[0],
  );
}

/** "1,204 plays" */
export const playsLabel = (count: number) => `${count.toLocaleString("en-US")} ${count === 1 ? "play" : "plays"}`;
