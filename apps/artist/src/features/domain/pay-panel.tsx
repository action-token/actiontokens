"use client";

import { CircleAlert } from "lucide-react";
import { useState } from "react";

import { Button } from "@actiontokens/ui/components/button";
import { Skeleton } from "@actiontokens/ui/components/skeleton";
import { cn } from "@actiontokens/ui/lib/cn";
import { PriceBreakdown, ShortfallNotice } from "@actiontokens/ui/patterns/price-breakdown";
import { ToastViewport, TransactionToast } from "@actiontokens/ui/patterns/transaction-toast";

import { Money } from "~/components/money";
import { api } from "~/trpc/react";

import { useSquareCard } from "../recharge/square-card";
import { FAN_APP_URL } from "../shell/links";

import { useVanityPayment, type VanityPayInput } from "./use-vanity-payment";

type Currency = VanityPayInput["currency"];
const CURRENCIES: { value: Currency; label: string }[] = [
  { value: "BANDCOIN", label: "BANDCOIN" },
  { value: "XLM", label: "XLM" },
  { value: "USDC", label: "USDC" },
  { value: "USD", label: "Card" },
];

/**
 * Pay for the link: pick BANDCOIN, XLM, USDC or a card, see the whole price (a
 * month or a new name, the platform fee and, on-chain, the network fee), and
 * pay. The server does the money math; nothing is signed or charged until the
 * button is pressed.
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
  const byCard = currency === "USD";
  const { container: cardField, ...card } = useSquareCard(byCard);

  const data = quote.data;
  const main = data?.totals.find((total) => total.currency === currency);
  const short = data?.problems.flatMap((problem) =>
    problem.code === "INSUFFICIENT_FUNDS" ? [problem.shortfall] : [],
  );
  const notices = data?.problems.filter((problem) => problem.code === "UNAVAILABLE") ?? [];
  const balance = byCard ? undefined : me.data?.balances[currency];

  async function pay() {
    const summary = main ? <Money amount={main.amount} currency={currency} /> : null;
    if (!byCard) return flow.run(summary);
    const token = await card.tokenize();
    if (token) await flow.run(summary, token);
  }

  return (
    <div className="grid gap-4">
      <div role="radiogroup" aria-label="Pay with" className="flex flex-wrap gap-2">
        {CURRENCIES.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={currency === option.value}
            disabled={flow.busy}
            onClick={() => setCurrency(option.value)}
            className={cn(
              "rounded-full border-2 px-3.5 py-1.5 text-sm font-medium transition-colors",
              currency === option.value ? "border-primary bg-primary-soft" : "hover:bg-surface-2",
            )}
          >
            {option.label}
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

      {byCard && (
        <div className="grid gap-1.5">
          <div
            ref={cardField}
            className={cn("min-h-[90px]", card.loading && "bg-surface-2 animate-pulse rounded-md")}
          />
          {card.error && <p className="text-danger text-xs">{card.error}</p>}
        </div>
      )}

      <Button
        disabled={!data?.ok || flow.busy || (byCard && !card.ready)}
        onClick={() => void pay()}
        className="justify-self-start"
      >
        {flow.busy ? (
          "Working…"
        ) : main ? (
          <>
            Pay <Money amount={main.amount} currency={currency} />
          </>
        ) : (
          "Pay"
        )}
      </Button>

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
