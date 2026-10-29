"use client";

import { CircleAlert } from "lucide-react";

import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { PriceBreakdown, ShortfallNotice } from "@bandcoin/ui/patterns/price-breakdown";

import { Money } from "~/components/money";
import type { DisplayCurrency } from "~/lib/format";

type Line = { label: string; currency: DisplayCurrency; amount: string };
type Problem_ =
  | { code: "INSUFFICIENT_FUNDS"; message: string; shortfall: { currency: "BANDCOIN" | "XLM"; short: string } }
  | { code: string; message: string };

/**
 * The server's price breakdown for any recharge: cost lines, what you pay, and
 * why it can't go through (short on funds, unavailable). It does no money math.
 */
export function QuoteBreakdown({
  lines,
  pay,
  problems,
  loading,
  error,
  balance,
}: {
  lines: Line[];
  pay: { currency: DisplayCurrency; amount: string } | null;
  problems: Problem_[];
  loading: boolean;
  error?: string;
  /** Shown under the total when the fan pays from a balance */
  balance?: { currency: "BANDCOIN" | "XLM"; amount: string };
}) {
  if (loading) {
    return (
      <div className="grid gap-2 border-t pt-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-5 w-full" />
      </div>
    );
  }
  if (error) return <Problem message={error} />;

  const shortfalls = problems.flatMap((problem) => (problem.code === "INSUFFICIENT_FUNDS" && "shortfall" in problem ? [problem.shortfall] : []));
  const notices = problems.filter((problem) => problem.code === "UNAVAILABLE" || problem.code === "RATE_UNAVAILABLE");
  const short = balance ? shortfalls.find((shortfall) => shortfall.currency === balance.currency) : undefined;

  return (
    <>
      {pay && (
        <PriceBreakdown
          lines={lines.map((line) => ({ label: line.label, value: <Money amount={line.amount} currency={line.currency} /> }))}
          total={<Money amount={pay.amount} currency={pay.currency} />}
          balance={
            balance
              ? {
                  value: <Money amount={balance.amount} currency={balance.currency} />,
                  shortBy: short ? <Money amount={short.short} currency={short.currency} /> : undefined,
                }
              : undefined
          }
        />
      )}
      {shortfalls.map((shortfall) => (
        <ShortfallNotice key={shortfall.currency} currency={shortfall.currency} shortBy={<Money amount={shortfall.short} currency={shortfall.currency} />} />
      ))}
      {notices.map((problem) => (
        <Problem key={problem.message} message={problem.message} />
      ))}
    </>
  );
}

export function Problem({ message }: { message: string }) {
  return (
    <div role="alert" className="bg-surface-2 text-fg-muted flex gap-2.5 rounded-md p-3 text-[13px]">
      <CircleAlert className="text-warning mt-px size-4 shrink-0" />
      {message}
    </div>
  );
}
