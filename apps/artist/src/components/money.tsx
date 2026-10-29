import { cn } from "@bandcoin/ui/lib/cn";
import { CurrencyIcon } from "@bandcoin/ui/patterns/currency-icon";

import { type DisplayCurrency, formatAmount } from "~/lib/format";

/** A price: the currency's icon and the amount, never the word "BANDCOIN". The name is kept for screen readers. */
export function Money({
  amount,
  currency,
  short,
  className,
}: {
  amount: string | number;
  currency: DisplayCurrency;
  /** 2 decimals, for headlines */
  short?: boolean;
  className?: string;
}) {
  if (currency === "USD")
    return <span className={cn("num", className)}>{formatAmount(amount, "USD")}</span>;
  return (
    <span className={cn("num inline-flex items-center gap-[0.3em] whitespace-nowrap", className)}>
      <CurrencyIcon currency={currency} className="size-[1.1em]" />
      {formatAmount(amount, currency, { short })}
      <span className="sr-only"> {currency}</span>
    </span>
  );
}
