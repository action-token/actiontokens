import { Fragment } from "react";

import { cn } from "@actiontokens/ui/lib/cn";
import { CurrencyIcon } from "@actiontokens/ui/patterns/currency-icon";

import { cardChargeUsd, type DisplayCurrency, formatAmount } from "~/lib/format";

/**
 * A price: the currency's icon and the amount ("🪙 25,000"), never the word
 * "ACTION". The currency name is kept for screen readers. Card amounts show
 * as dollars.
 */
export function Money({
  amount,
  currency,
  code,
  short,
  className,
  onBrand,
}: {
  amount: string | number;
  /** Null for any other token (say an artist's fan token): shown as the amount and its `code` */
  currency: DisplayCurrency | null;
  code?: string;
  /** 2 decimals, for headlines */
  short?: boolean;
  className?: string;
  /** On a brand-coloured background the coin gets a dark backing so it stays visible */
  onBrand?: boolean;
}) {
  // The display face replaces the mono figures (headline prices); both keep equal-width digits.
  const face = className?.includes("display") ? "tabular-nums" : "num";
  if (currency === null)
    return (
      <span className={cn(face, "whitespace-nowrap", className)}>
        {formatAmount(amount, "XLM", { short })}{" "}
        <span className="text-[0.85em] font-semibold">{code}</span>
      </span>
    );
  if (currency === "USD")
    return <span className={cn(face, className)}>{formatAmount(amount, "USD")}</span>;
  return (
    <span className={cn(face, "inline-flex items-center gap-[0.3em] whitespace-nowrap", className)}>
      <CurrencyIcon
        currency={currency}
        className={cn("size-[1.1em]", onBrand && "rounded-full bg-black/85 p-[0.12em]")}
      />
      {formatAmount(amount, currency, { short })}
      <span className="sr-only"> {currency}</span>
    </span>
  );
}

/** A quote's totals, "🪙 20.5 + ✦ 0.50004"; card totals are what the card is charged. */
export function MoneyTotals({
  totals,
  className,
  stacked,
}: {
  totals: { currency: DisplayCurrency; amount: string }[];
  className?: string;
  /** One total per line (the breakdown) instead of one line (buttons, toasts) */
  stacked?: boolean;
}) {
  return (
    <span
      className={cn(
        stacked ? "grid justify-items-end" : "inline-flex flex-wrap items-center gap-x-1",
        className,
      )}
    >
      {totals.map((total, index) => (
        <Fragment key={total.currency}>
          {index > 0 && !stacked && <span aria-hidden>+</span>}
          <span className="inline-flex items-center gap-1">
            {index > 0 && stacked && <span aria-hidden>+</span>}
            <Money
              amount={total.currency === "USD" ? cardChargeUsd(total.amount) : total.amount}
              currency={total.currency}
            />
          </span>
        </Fragment>
      ))}
    </span>
  );
}
