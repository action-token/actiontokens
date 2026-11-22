"use client";

import { Clock } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useState } from "react";

import { Badge } from "@actiontokens/ui/components/badge";
import { Button } from "@actiontokens/ui/components/button";
import { Skeleton } from "@actiontokens/ui/components/skeleton";
import { cn } from "@actiontokens/ui/lib/cn";
import { QuantityStepper } from "@actiontokens/ui/patterns/quantity-stepper";
import { ToastViewport, TransactionToast } from "@actiontokens/ui/patterns/transaction-toast";
import { useConnectWalletDialogStore } from "@actiontokens/wallet";

import { Money, MoneyTotals } from "~/components/money";
import type { DisplayCurrency } from "~/lib/format";
import { api, type RouterOutputs } from "~/trpc/react";

import { Breakdown, Problem } from "./breakdown";
import { CURRENCIES, CurrencyPicker } from "./currency-picker";
import { GuestCheckout } from "./guest-checkout";
import { useSquareCard } from "./square-card";
import { usePurchase } from "./use-purchase";

type Listing = RouterOutputs["item"]["bySlug"]["listings"][number];
type Quote = RouterOutputs["order"]["quote"];

/** Most copies one order can include (the API allows 50; the NFT contract mints up to 20 at once). */
const MAX_PER_ORDER = 50;
const MAX_NFT_PER_ORDER = 20;

/**
 * Buy copies of an item: pick a currency and quantity, read the full price
 * breakdown from the server quote, pay. Nothing is ever converted: if the
 * balance is short, it says how much and the Pay button becomes Add funds.
 */
export function BuyPanel({
  itemTitle,
  listing,
  nft = false,
  stacked = false,
}: {
  itemTitle: string;
  listing: Listing;
  /** Contract NFTs are paid in ACTION or by card */
  nft?: boolean;
  /** One column on wide screens, for a narrow side panel */
  stacked?: boolean;
}) {
  const { status } = useSession();
  const openSignIn = useConnectWalletDialogStore((state) => state.setIsOpen);
  const [currency, setCurrency] = useState<DisplayCurrency>("ACTION");
  const [quantity, setQuantity] = useState(1);
  const me = api.account.me.useQuery(undefined, { enabled: status === "authenticated" });
  const purchase = usePurchase({ itemTitle });
  const [guestBusy, setGuestBusy] = useState(false);
  const signedOut = status === "unauthenticated";
  const guest = signedOut && currency === "USD";
  const busy = purchase.busy || guestBusy;
  const { container: cardField, ...card } = useSquareCard(
    currency === "USD" && status === "authenticated",
  );

  const perOrder = nft ? MAX_NFT_PER_ORDER : MAX_PER_ORDER;
  const maxQuantity = Math.max(1, Math.min(perOrder, listing.remaining ?? perOrder));
  const currencies = nft
    ? CURRENCIES.filter((option) => option.value === "ACTION" || option.value === "USD")
    : CURRENCIES;
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
  const notSetUp = quote.data?.problems.find((problem) => problem.code === "NOT_SET_UP");

  async function pay() {
    if (!quote.data) return;
    const cardToken = currency === "USD" ? await card.tokenize() : undefined;
    if (currency === "USD" && !cardToken) return;
    await purchase.buy({
      listingId: listing.id,
      quantity,
      currency,
      summary: (
        <>
          <MoneyTotals totals={quote.data.totals} /> for {quantity} × {itemTitle}
        </>
      ),
      card: cardToken ?? undefined,
    });
  }

  // The artist's own prices show right away; XLM and USDC wait for the live rate.
  const unitPrice =
    quote.data?.currency === currency
      ? quote.data.unitPrice
      : currency === "ACTION"
        ? listing.priceActionToken
        : currency === "USD"
          ? listing.priceUsd
          : null;

  return (
    <section
      aria-label="Buy"
      className={cn("grid gap-6 md:grid-cols-2 md:gap-x-10", stacked && "xl:grid-cols-1")}
    >
      <div className="grid content-start gap-5">
        <div className="flex items-baseline justify-between gap-3">
          <div className="text-[30px] leading-none font-semibold tracking-tight">
            {unitPrice === null ? (
              <Skeleton className="inline-block h-7 w-28 align-middle" />
            ) : (
              <Money amount={unitPrice} currency={currency} short className="display" />
            )}
          </div>
          <Badge>
            {listing.kind === "PRIMARY"
              ? "per copy"
              : listing.kind === "BUNDLE"
                ? "whole bundle"
                : "resale"}
          </Badge>
        </div>

        <CurrencyPicker
          value={currency}
          onChange={setCurrency}
          options={currencies}
          balances={me.data?.balances}
          disabled={busy}
        />

        {nft && listing.isOwn && (
          <p className="bg-surface-2 text-fg-muted rounded-md p-3 text-xs">
            This is your NFT. The price comes back to you in ACTION, so what it really costs you is
            the fees. Copies you own can be gifted from Gifts in the organization portal.
          </p>
        )}

        <div className="flex items-center justify-between gap-3">
          <div>
            <b className="text-sm">Quantity</b>
            <p className="text-fg-faint text-xs">
              {listing.remaining === null
                ? "Unlimited copies"
                : `${listing.remaining.toLocaleString()} left`}
            </p>
          </div>
          <QuantityStepper
            value={quantity}
            onChange={setQuantity}
            max={maxQuantity}
            disabled={busy || soldOut}
          />
        </div>
      </div>

      {notSetUp ? (
        <NotSetUp message={notSetUp.message} />
      ) : guest ? (
        <GuestCheckout
          itemTitle={itemTitle}
          listingId={listing.id}
          quantity={quantity}
          soldOut={soldOut}
          onBusyChange={setGuestBusy}
        />
      ) : (
        <div className="grid content-start gap-5">
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
              <div
                ref={cardField}
                className={cn(
                  "min-h-[90px]",
                  card.loading && "bg-surface-2 animate-pulse rounded-md",
                )}
              />
              {card.error && <p className="text-danger text-xs">{card.error}</p>}
            </div>
          )}

          <PayButton
            quote={quote.data}
            signedOut={signedOut}
            soldOut={soldOut}
            busy={purchase.busy || quote.isFetching}
            cardNotReady={currency === "USD" && !card.ready}
            onSignIn={() => openSignIn(true)}
            onPay={() => void pay()}
          />
          {signedOut && !soldOut && (
            <Button variant="ghost" size="sm" onClick={() => setCurrency("USD")}>
              Or pay by card with just your email
            </Button>
          )}
        </div>
      )}

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
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-3 text-[13px]"
                    onClick={purchase.close}
                  >
                    Close
                  </Button>
                </>
              ) : purchase.step.kind === "confirm" ? (
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-8 px-3 text-[13px]"
                  onClick={purchase.stop}
                >
                  Cancel
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-8 px-3 text-[13px]"
                  onClick={purchase.close}
                >
                  Close
                </Button>
              )
            }
          />
        </ToastViewport>
      )}
    </section>
  );
}

/** In place of Pay: the artist's side isn't on Stellar yet, so nothing can be bought. */
function NotSetUp({ message }: { message: string }) {
  return (
    <div role="status" className="bg-surface-2 grid gap-1 rounded-xl border p-4">
      <b className="flex items-center gap-2 text-sm">
        <Clock className="text-fg-muted size-4 shrink-0" /> {message}
      </b>
      <p className="text-fg-muted text-xs">
        You can still listen and follow them. Buying opens once they&apos;re ready.
      </p>
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
  if (soldOut)
    return (
      <Button size="lg" disabled>
        Sold out
      </Button>
    );
  // The quote decides: a stale browser session still gets "Sign in".
  if (signedOut || quote?.problems.some((problem) => problem.code === "SIGN_IN"))
    return (
      <Button size="lg" onClick={onSignIn}>
        Sign in to buy
      </Button>
    );
  if (!quote)
    return (
      <Button size="lg" disabled>
        Getting the price…
      </Button>
    );
  if (quote.problems.some((problem) => problem.code === "INSUFFICIENT_FUNDS")) {
    return (
      <Button asChild size="lg" variant="secondary">
        <Link href="/wallet">Add funds</Link>
      </Button>
    );
  }
  return (
    <Button size="lg" disabled={!quote.ok || busy || cardNotReady} onClick={onPay}>
      {quote.ok ? (
        <>
          Pay <MoneyTotals totals={quote.totals} />
        </>
      ) : (
        "Can't buy right now"
      )}
    </Button>
  );
}
