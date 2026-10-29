"use client";

import { CircleAlert } from "lucide-react";
import { useState } from "react";

import { Button } from "@bandcoin/ui/components/button";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { cn } from "@bandcoin/ui/lib/cn";
import { PriceBreakdown, ShortfallNotice } from "@bandcoin/ui/patterns/price-breakdown";
import { ToastViewport, TransactionToast } from "@bandcoin/ui/patterns/transaction-toast";

import { Money } from "~/components/money";
import { api } from "~/trpc/react";

import { FAN_APP_URL } from "../shell/links";

import { useVanityPayment, type VanityPayInput } from "./use-vanity-payment";

type Currency = VanityPayInput["currency"];
const CURRENCIES: Currency[] = ["BANDCOIN", "XLM", "USDC"];

/**
 * Pay for the link: pick BANDCOIN, XLM or USDC, see the whole price (a month or
 * a new name, plus the network fee), and pay. The server does the money math;
 * nothing is signed until the button is pressed.
 */
export function PayPanel({
  purpose,
  name,
  onDone,
}: {
  purpose: VanityPayInput["purpose"];
  /** The name being paid for: a new link's, or the rename */
  name?: string;
  onDone: () => void;
}) {
  const [currency, setCurrency] = useState<Currency>("BANDCOIN");
  const input = { purpose, name, currency };
  const quote = api.vanity.quote.useQuery(input, {
    refetchInterval: 30_000,
    placeholderData: (previous) => previous,
  });
  const me = api.account.me.useQuery();
  const flow = useVanityPayment(input, onDone);

  const data = quote.data;
  const main = data?.totals.find((total) => total.currency === currency);
  const short = data?.problems.flatMap((problem) =>
    problem.code === "INSUFFICIENT_FUNDS" ? [problem.shortfall] : [],
  );
  const notices = data?.problems.filter((problem) => problem.code === "UNAVAILABLE") ?? [];
  const balance = me.data?.balances[currency];

  return (
    <div className="grid gap-4">
      <div role="radiogroup" aria-label="Pay with" className="flex flex-wrap gap-2">
        {CURRENCIES.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={currency === option}
            disabled={flow.busy}
            onClick={() => setCurrency(option)}
            className={cn(
              "rounded-full border-2 px-3.5 py-1.5 text-sm font-medium transition-colors",
              currency === option ? "border-primary bg-primary-soft" : "hover:bg-surface-2",
            )}
          >
            {option}
          </button>
        ))}
      </div>

      {!data ? (
        <div className="grid gap-2 border-t pt-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-5 w-full" />
        </div>
      ) : (
        <>
          <PriceBreakdown
            lines={data.lines.map((line) => ({
              label: line.label,
              value: <Money amount={line.amount} currency={line.currency} />,
            }))}
            total={
              <span className="inline-flex flex-wrap items-center justify-end gap-x-2">
                {data.totals.map((total) => (
                  <Money key={total.currency} amount={total.amount} currency={total.currency} />
                ))}
              </span>
            }
            balance={
              balance
                ? {
                    value: <Money amount={balance} currency={currency} />,
                    shortBy: short?.find((s) => s.currency === currency) ? (
                      <Money
                        amount={short.find((s) => s.currency === currency)!.short}
                        currency={currency}
                      />
                    ) : undefined,
                  }
                : undefined
            }
          />
          {short?.map((shortfall) => (
            <div key={shortfall.currency}>
              <ShortfallNotice
                currency={shortfall.currency}
                shortBy={<Money amount={shortfall.short} currency={shortfall.currency} />}
              />
              <a href={`${FAN_APP_URL}/recharge`} className="text-primary-text text-xs underline">
                Add funds
              </a>
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
      )}

      <Button
        disabled={!data?.ok || flow.busy}
        onClick={() =>
          void flow.run(main ? <Money amount={main.amount} currency={currency} /> : null)
        }
        className="justify-self-start"
      >
        {flow.busy ? (
          "Working…"
        ) : main ? (
          <>
            {purpose === "RENEWAL" ? "Pay for a month" : "Change name"} ·{" "}
            <Money amount={main.amount} currency={currency} />
          </>
        ) : (
          "Pay"
        )}
      </Button>
      <p className="text-fg-faint text-xs">
        You pay the price and the network fee. Bandcoin never covers it, and nothing is signed until
        you press the button.
      </p>

      {flow.step && (
        <ToastViewport>
          <TransactionToast
            key={flow.step.kind}
            step={flow.step}
            onSend={flow.send}
            onCancel={flow.stop}
            actions={
              <Button
                size="sm"
                variant="secondary"
                className="h-8 px-3 text-[13px]"
                onClick={flow.step.kind === "confirm" ? flow.stop : flow.close}
              >
                {flow.step.kind === "confirm" ? "Cancel" : "Close"}
              </Button>
            }
          />
        </ToastViewport>
      )}
    </div>
  );
}
