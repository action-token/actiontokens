"use client";

import { CircleAlert } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useState } from "react";

import { Badge } from "@bandcoin/ui/components/badge";
import { Button } from "@bandcoin/ui/components/button";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { cn } from "@bandcoin/ui/lib/cn";
import { CurrencyIcon } from "@bandcoin/ui/patterns/currency-icon";
import { PriceBreakdown, ShortfallNotice } from "@bandcoin/ui/patterns/price-breakdown";
import { QuantityStepper } from "@bandcoin/ui/patterns/quantity-stepper";
import { ToastViewport, TransactionToast } from "@bandcoin/ui/patterns/transaction-toast";
import { useConnectWalletDialogStore } from "@bandcoin/wallet";

import { cardChargeUsd, type DisplayCurrency, formatAmount, formatMoney } from "~/lib/format";
import { api, type RouterOutputs } from "~/trpc/react";

import { useSquareCard } from "./square-card";
import { usePurchase } from "./use-purchase";

type Listing = RouterOutputs["item"]["bySlug"]["listings"][number];
type Quote = RouterOutputs["order"]["quote"];

/** Most copies one order can include (the API allows 50). */
const MAX_PER_ORDER = 50;

const CURRENCIES: { value: DisplayCurrency; label: string }[] = [
  { value: "BANDCOIN", label: "BANDCOIN" },
  { value: "XLM", label: "XLM" },
  { value: "USDC", label: "USDC" },
  { value: "USD", label: "Card" },
];

/**
 * Buy copies of an item: pick a currency and quantity, read the full price
 * breakdown from the server quote, pay. Nothing is ever converted: if the
 * balance is short, it says how much and the Pay button becomes Add funds.
 */
export function BuyPanel({ itemTitle, listing }: { itemTitle: string; listing: Listing }) {
  const { status } = useSession();
  const openSignIn = useConnectWalletDialogStore((state) => state.setIsOpen);
  const [currency, setCurrency] = useState<DisplayCurrency>("BANDCOIN");
  const [quantity, setQuantity] = useState(1);
  const me = api.account.me.useQuery(undefined, { enabled: status === "authenticated" });
  const purchase = usePurchase({ itemTitle });
  const { container: cardField, ...card } = useSquareCard(currency === "USD" && status === "authenticated");

  const maxQuantity = Math.max(1, Math.min(MAX_PER_ORDER, listing.remaining ?? MAX_PER_ORDER));
  const quote = api.order.quote.useQuery(
    { listingId: listing.id, quantity, currency },
    {
      refetchInterval: 30_000,
      // Keep the last numbers while quantity changes, but never show another currency's quote.
      placeholderData: (previous) => (previous?.currency === currency ? previous : undefined),
      enabled: status !== "loading",
    },
  );
  const soldOut = listing.remaining === 0;

  async function pay() {
    if (!quote.data) return;
    const cardToken = currency === "USD" ? await card.tokenize() : undefined;
    if (currency === "USD" && !cardToken) return;
    await purchase.buy({
      listingId: listing.id,
      quantity,
      currency,
      summary: `${totalText(quote.data)} for ${quantity} × ${itemTitle}`,
      card: cardToken ?? undefined,
    });
  }

  // The artist's own prices show right away; XLM and USDC wait for the live rate.
  const unitPrice =
    quote.data?.currency === currency
      ? formatAmount(quote.data.unitPrice, currency, { short: true })
      : currency === "BANDCOIN"
        ? formatAmount(listing.priceBandcoin, "BANDCOIN")
        : currency === "USD"
          ? formatAmount(listing.priceUsd, "USD")
          : null;

  return (
    <aside aria-label="Buy" className="bg-surface shadow-raised grid gap-5 rounded-xl border p-5 lg:sticky lg:top-20">
      <div className="flex items-baseline justify-between gap-3">
        <div className="num text-[30px] leading-none font-semibold tracking-tight">
          {unitPrice ?? <Skeleton className="inline-block h-7 w-28 align-middle" />}
          {currency !== "USD" && <small className="text-fg-muted ml-1.5 text-sm">{currency}</small>}
        </div>
        <Badge>{listing.kind === "PRIMARY" ? "per copy" : "resale"}</Badge>
      </div>

      <div className="grid gap-1.5">
        <span className="eyebrow">Pay with</span>
        <div role="group" aria-label="Currency" className="grid grid-cols-2 gap-2">
          {CURRENCIES.map((option) => (
            <button
              key={option.value}
              type="button"
              disabled={purchase.busy}
              aria-pressed={option.value === currency}
              onClick={() => setCurrency(option.value)}
              className={cn(
                "bg-surface-2 hover:border-border-strong grid min-w-0 gap-0.5 rounded-md border p-2.5 text-left transition-colors",
                option.value === currency && "border-primary-text bg-primary-soft",
              )}
            >
              <b className="flex items-center gap-2 text-[13px]">
                <CurrencyIcon currency={option.value} />
                {option.label}
              </b>
              <span className={cn("text-fg-muted truncate text-[11px]", me.data && option.value !== "USD" && "num")}>
                {option.value === "USD"
                  ? "Debit or credit"
                  : me.data
                    ? `Balance ${formatAmount(me.data.balances[option.value], option.value)}`
                    : "Stellar wallet"}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div>
          <b className="text-sm">Quantity</b>
          <p className="text-fg-faint text-xs">
            {listing.remaining === null ? "Unlimited copies" : `${listing.remaining.toLocaleString()} left`}
          </p>
        </div>
        <QuantityStepper value={quantity} onChange={setQuantity} max={maxQuantity} disabled={purchase.busy || soldOut} />
      </div>

      {quote.isPending ? (
        <div className="grid gap-2 border-t pt-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-5 w-full" />
        </div>
      ) : quote.error ? (
        <Problem message={quote.error.message} />
      ) : (
        <Breakdown quote={quote.data} balances={me.data?.balances} />
      )}

      {currency === "USD" && status === "authenticated" && (
        <div className="grid gap-1.5">
          <div ref={cardField} className={cn("min-h-[90px]", card.loading && "bg-surface-2 animate-pulse rounded-md")} />
          {card.error && <p className="text-danger text-xs">{card.error}</p>}
        </div>
      )}

      <PayButton
        quote={quote.data}
        signedOut={status === "unauthenticated"}
        soldOut={soldOut}
        busy={purchase.busy || quote.isFetching}
        cardNotReady={currency === "USD" && !card.ready}
        onSignIn={() => openSignIn(true)}
        onPay={() => void pay()}
      />

      {purchase.step && (
        <ToastViewport>
          <TransactionToast
            key={purchase.step.kind}
            step={purchase.step}
            onSend={purchase.send}
            onCancel={purchase.stop}
            actions={
              purchase.step.kind === "success" ? (
                <>
                  <Button asChild size="sm" variant="secondary" className="h-8 px-3 text-[13px]">
                    <Link href="/collection">View collection</Link>
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 px-3 text-[13px]" onClick={purchase.close}>
                    Close
                  </Button>
                </>
              ) : purchase.step.kind === "confirm" ? (
                <Button size="sm" variant="secondary" className="h-8 px-3 text-[13px]" onClick={purchase.stop}>
                  Cancel
                </Button>
              ) : (
                <Button size="sm" variant="secondary" className="h-8 px-3 text-[13px]" onClick={purchase.close}>
                  Close
                </Button>
              )
            }
          />
        </ToastViewport>
      )}
    </aside>
  );
}

/** "20.5 BANDCOIN + 0.50004 XLM", or the card charge "$5.26". */
function totalText(quote: Quote) {
  return quote.totals
    .map((total) =>
      total.currency === "USD" ? formatMoney(cardChargeUsd(total.amount), "USD") : formatMoney(total.amount, total.currency),
    )
    .join(" + ");
}

function Breakdown({ quote, balances }: { quote: Quote; balances?: Record<"BANDCOIN" | "XLM" | "USDC", string> }) {
  const shortfalls = quote.problems.flatMap((problem) => (problem.code === "INSUFFICIENT_FUNDS" ? [problem.shortfall] : []));
  const unavailable = quote.problems.filter((problem) => problem.code === "UNAVAILABLE");
  const paying = quote.currency === "USD" ? null : quote.currency;
  const short = shortfalls.find((shortfall) => shortfall.currency === paying);

  return (
    <>
      <PriceBreakdown
        lines={quote.lines.map((line) => ({
          label: line.label,
          detail:
            line.key === "price"
              ? `${quote.quantity} × ${formatMoney(quote.unitPrice, quote.currency)}`
              : line.detail,
          value: formatMoney(line.amount, line.currency),
        }))}
        total={quote.totals.map((total, index) => (
          <span key={total.currency} className="block">
            {index > 0 && "+ "}
            {total.currency === "USD"
              ? formatMoney(cardChargeUsd(total.amount), "USD")
              : formatMoney(total.amount, total.currency)}
          </span>
        ))}
        balance={
          paying && balances
            ? {
                value: formatMoney(balances[paying], paying),
                shortBy: short ? formatMoney(short.short, short.currency) : undefined,
              }
            : undefined
        }
      />
      {shortfalls.map((shortfall) => (
        <ShortfallNotice
          key={shortfall.currency}
          currency={shortfall.currency}
          shortBy={formatMoney(shortfall.short, shortfall.currency)}
        />
      ))}
      {unavailable.map((problem) => (
        <Problem key={problem.message} message={problem.message} />
      ))}
    </>
  );
}

function Problem({ message }: { message: string }) {
  return (
    <div role="alert" className="bg-surface-2 text-fg-muted flex gap-2.5 rounded-md p-3 text-[13px]">
      <CircleAlert className="text-warning mt-px size-4 shrink-0" />
      {message}
    </div>
  );
}

function PayButton({
  quote,
  signedOut,
  soldOut,
  busy,
  cardNotReady,
  onSignIn,
  onPay,
}: {
  quote: Quote | undefined;
  signedOut: boolean;
  soldOut: boolean;
  busy: boolean;
  cardNotReady: boolean;
  onSignIn: () => void;
  onPay: () => void;
}) {
  if (soldOut) return <Button size="lg" disabled>Sold out</Button>;
  if (signedOut) return <Button size="lg" onClick={onSignIn}>Sign in to buy</Button>;
  if (!quote) return <Button size="lg" disabled>Getting the price…</Button>;
  if (quote.problems.some((problem) => problem.code === "INSUFFICIENT_FUNDS")) {
    return (
      <Button asChild size="lg" variant="secondary">
        <Link href="/wallet">Add funds</Link>
      </Button>
    );
  }
  return (
    <Button size="lg" disabled={!quote.ok || busy || cardNotReady} onClick={onPay}>
      {quote.ok ? `Pay ${totalText(quote)}` : "Can't buy right now"}
    </Button>
  );
}
