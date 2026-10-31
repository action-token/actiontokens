"use client";

import { CircleAlert } from "lucide-react";

import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { PriceBreakdown } from "@bandcoin/ui/patterns/price-breakdown";

import { Money } from "~/components/money";
import type { RouterOutputs } from "~/trpc/react";

import { FAN_APP_URL } from "../shell/links";

export type XlmQuote =
  | RouterOutputs["onboarding"]["issuerQuote"]
  | RouterOutputs["profile"]["stockQuote"]
  | RouterOutputs["profile"]["withdrawQuote"]
  | RouterOutputs["gifts"]["quote"];

/**
 * The server's price for a payment in XLM (opening the artist account, sending a gift):
 * each cost, what you pay, your XLM, and why it can't go through yet. It does no money math.
 */
export function QuoteBreakdown({
  quote,
  balance,
  loading,
}: {
  quote: XlmQuote | undefined;
  balance: string | undefined;
  loading: boolean;
}) {
  if (loading || !quote) {
    return (
      <div className="grid gap-2 border-t pt-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-5 w-full" />
      </div>
    );
  }

  const shortfalls = quote.problems.flatMap((problem) =>
    problem.code === "INSUFFICIENT_FUNDS" ? [problem.shortfall] : [],
  );
  const notices = quote.problems.filter((problem) => problem.code === "UNAVAILABLE");
  const short = shortfalls.find((shortfall) => shortfall.currency === "XLM");

  return (
    <>
      <PriceBreakdown
        lines={quote.lines
          .filter((line) => line.key !== "total")
          .map((line) => ({
            label: line.label,
            value: <Money amount={line.amount} currency="XLM" />,
          }))}
        total={<Money amount={quote.total} currency="XLM" />}
        balance={
          balance
            ? {
                value: <Money amount={balance} currency="XLM" />,
                shortBy: short ? <Money amount={short.short} currency="XLM" /> : undefined,
              }
            : undefined
        }
      />
      {shortfalls.map((shortfall) => (
        <div
          key={shortfall.currency}
          role="alert"
          className="bg-danger-soft grid grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-md p-3 text-[13px]"
        >
          <CircleAlert className="text-danger mt-px size-[18px]" />
          <p>
            <b>Not enough XLM</b>
            <br />
            You need <Money amount={shortfall.short} currency="XLM" /> more. Get XLM in{" "}
            <a href={`${FAN_APP_URL}/recharge`} className="underline">
              Recharge
            </a>
            , then come back. We never convert your other tokens for you.
          </p>
        </div>
      ))}
      {notices.map((problem) => (
        <div
          key={problem.message}
          role="alert"
          className="bg-surface-2 text-fg-muted flex gap-2.5 rounded-md p-3 text-[13px]"
        >
          <CircleAlert className="text-warning mt-px size-4 shrink-0" />
          {problem.message}
        </div>
      ))}
    </>
  );
}
