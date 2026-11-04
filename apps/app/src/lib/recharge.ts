type Line = { key: string; label: string; currency: "USD" | "BANDCOIN" | "XLM"; amount: string };
type QuoteLines = { kind: "TOP_UP" | "XLM_SWAP" | "TOKEN_TRUST"; lines: Line[] };

/** The breakdown's own "You pay" row is the charge or total, so it isn't repeated as a line. */
export const shownLines = (quote: QuoteLines) =>
  quote.lines.filter((line) => line.key !== "charge" && line.key !== "total");

/** What the fan pays: the card charge for a top-up, the BANDCOIN total for the swap. */
export function payOf(quote: QuoteLines) {
  const line = quote.lines.find(
    (candidate) => candidate.key === (quote.kind === "TOP_UP" ? "charge" : "total"),
  );
  return line ? { currency: line.currency, amount: line.amount } : null;
}
