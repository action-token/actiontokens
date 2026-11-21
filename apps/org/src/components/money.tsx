import { cn } from "@actiontokens/ui/lib/cn";
import { CurrencyIcon } from "@actiontokens/ui/patterns/currency-icon";

import { type DisplayCurrency, formatAmount } from "~/lib/format";

/** A price: the currency's icon and the amount, never the word "ACTION". The name is kept for screen readers. */
export function Money({
  amount,
  currency,
  code,
  short,
  className,
}: {
  amount: string | number;
  /** Null for any other token (say an artist's fan token): shown as the amount and its `code` */
  currency: DisplayCurrency | null;
  code?: string;
  /** 2 decimals, for headlines */
  short?: boolean;
  className?: string;
}) {
  // The display face replaces the mono figures (headline amounts); both keep equal-width digits.
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
      <CurrencyIcon currency={currency} className="size-[1.1em]" />
      {formatAmount(amount, currency, { short })}
      <span className="sr-only"> {currency}</span>
    </span>
  );
}
