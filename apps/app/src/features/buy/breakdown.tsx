"use client";

import { CircleAlert } from "lucide-react";

import { PriceBreakdown, ShortfallNotice } from "@actiontokens/ui/patterns/price-breakdown";

import { Money, MoneyTotals } from "~/components/money";
import type { RouterOutputs } from "~/trpc/react";

type Quote = RouterOutputs["order"]["quote"];

/** The server's price, line by line, with your balance and what stands in the way. */
export function Breakdown({
  quote,
  balances,
}: {
  quote: Quote;
  balances?: Record<"ACTION" | "XLM" | "USDC", string>;
}) {
  const shortfalls = quote.problems.flatMap((problem) =>
    problem.code === "INSUFFICIENT_FUNDS" ? [problem.shortfall] : [],
  );
  const unavailable = quote.problems.filter((problem) => problem.code === "UNAVAILABLE");
  const paying = quote.currency === "USD" ? null : quote.currency;
  const short = shortfalls.find((shortfall) => shortfall.currency === paying);

  return (
    <>
      <PriceBreakdown
        lines={quote.lines.map((line) => ({
          label: line.label,
          detail:
            line.key === "price" ? (
              <span className="inline-flex items-center gap-1">
                {quote.quantity} × <Money amount={quote.unitPrice} currency={quote.currency} />
              </span>
            ) : (
              line.detail
            ),
          value: <Money amount={line.amount} currency={line.currency} />,
        }))}
        total={<MoneyTotals totals={quote.totals} stacked />}
        balance={
          paying && balances
            ? {
                value: <Money amount={balances[paying]} currency={paying} />,
                shortBy: short ? (
                  <Money amount={short.short} currency={short.currency} />
                ) : undefined,
              }
            : undefined
        }
      />
      {shortfalls.map((shortfall) => (
        <ShortfallNotice
          key={shortfall.currency}
          currency={shortfall.currency}
          shortBy={<Money amount={shortfall.short} currency={shortfall.currency} />}
        />
      ))}
      {unavailable.map((problem) => (
        <Problem key={problem.message} message={problem.message} />
      ))}
    </>
  );
}

export function Problem({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="bg-surface-2 text-fg-muted flex gap-2.5 rounded-md p-3 text-[13px]"
    >
      <CircleAlert className="text-warning mt-px size-4 shrink-0" />
      {message}
    </div>
  );
}
