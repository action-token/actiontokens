"use client";

import { CircleCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";

import { Button } from "@actiontokens/ui/components/button";
import { Input } from "@actiontokens/ui/components/input";
import { Skeleton } from "@actiontokens/ui/components/skeleton";
import { cn } from "@actiontokens/ui/lib/cn";
import { useConnectWalletDialogStore } from "@actiontokens/wallet";

import { MoneyTotals } from "~/components/money";
import { api } from "~/trpc/react";

import { Breakdown, Problem } from "./breakdown";
import { isEmail, mustNotPayAgain, sameTotal } from "./guest-rules";
import { useSquareCard } from "./square-card";

/** Wait for a pause in typing before pricing the address. */
const TYPING_PAUSE_MS = 400;

type Failure = { message: string; final: boolean };

/**
 * Buying by card with only an email. The full price for that address shows
 * first, including opening the account if it's new; then the card. Nothing is
 * retried: a failure says what happened and the buyer decides.
 */
export function GuestCheckout({
  itemTitle,
  listingId,
  quantity,
  soldOut,
  onBusyChange,
}: {
  itemTitle: string;
  listingId: string;
  quantity: number;
  soldOut: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const router = useRouter();
  const emailId = useId();
  const [typed, setTyped] = useState("");
  const [email, setEmail] = useState("");
  const [paying, setPaying] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [done, setDone] = useState<{ email: string; delivered: boolean } | null>(null);
  const { container: cardField, ...card } = useSquareCard(true);
  const start = api.order.guestStart.useMutation();
  const charge = api.order.guestPay.useMutation();

  useEffect(() => {
    const timer = setTimeout(() => setEmail(typed.trim()), TYPING_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [typed]);

  const priced = isEmail(email);
  const quote = api.order.guestQuote.useQuery(
    { listingId, quantity, email },
    { enabled: priced && !done, refetchInterval: paying ? false : 30_000 },
  );

  function setBusy(busy: boolean) {
    setPaying(busy);
    onBusyChange(busy);
  }

  async function pay() {
    if (!quote.data) return;
    setFailure(null);
    const token = await card.tokenize();
    if (!token) return;
    setBusy(true);
    try {
      const order = await start.mutateAsync({ listingId, quantity, email });
      // Never charge a total the buyer hasn't seen.
      if (!sameTotal(quote.data.totals, order.quote.totals)) {
        setFailure({
          message: "The price just changed, and your card wasn't charged. Check the new total.",
          final: false,
        });
        await quote.refetch();
        return;
      }
      const paid = await charge.mutateAsync({ orderId: order.orderId, email, card: token });
      setDone({ email, delivered: paid.status === "DELIVERED" });
      // The copies left, sold and owners on this page come from the server.
      router.refresh();
    } catch (error) {
      const appCode = (error as { data?: { appCode?: string | null } }).data?.appCode;
      const final = mustNotPayAgain(appCode);
      setFailure({
        message: final
          ? "We charged your card but haven't heard back from the network yet. Please don't pay again: this order will finish or be refunded on its own."
          : `${error instanceof Error ? error.message : "Something went wrong."} Any refund due goes back to your card.`,
        final,
      });
    } finally {
      setBusy(false);
    }
  }

  if (done) return <GuestSuccess itemTitle={itemTitle} {...done} />;

  const current = typed.trim() === email;
  const ready =
    priced && current && quote.data?.ok && !quote.isFetching && card.ready && !failure?.final;

  return (
    <div className="grid content-start gap-5">
      <div className="grid gap-1.5">
        <label htmlFor={emailId} className="text-sm font-semibold">
          Your email
        </label>
        <Input
          id={emailId}
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="you@example.com"
          value={typed}
          disabled={paying || failure?.final}
          onChange={(event) => setTyped(event.target.value)}
        />
        <p className="text-fg-faint text-xs">
          No sign-in needed. Your copy goes to the Bandcoin account for this email, and we make one
          if it&apos;s new.
        </p>
      </div>

      {!priced ? (
        <p className="bg-surface-2 text-fg-muted rounded-md p-3 text-[13px]">
          Enter your email to see the full price.
        </p>
      ) : quote.isPending ? (
        <div className="grid gap-2 border-t pt-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-5 w-full" />
        </div>
      ) : quote.error ? (
        <Problem message={quote.error.message} />
      ) : (
        <Breakdown quote={quote.data} />
      )}

      <div className="grid gap-1.5">
        <div
          ref={cardField}
          className={cn("min-h-[90px]", card.loading && "bg-surface-2 animate-pulse rounded-md")}
        />
        {card.error && <p className="text-danger text-xs">{card.error}</p>}
      </div>

      {failure && <Problem message={failure.message} />}

      {soldOut ? (
        <Button size="lg" disabled>
          Sold out
        </Button>
      ) : (
        <Button size="lg" disabled={!ready || paying} onClick={() => void pay()}>
          {paying ? (
            "Paying…"
          ) : priced && quote.data ? (
            <>
              Pay <MoneyTotals totals={quote.data.totals} />
            </>
          ) : (
            "Pay by card"
          )}
        </Button>
      )}
      {paying && (
        <p role="status" className="text-fg-muted -mt-2 text-center text-xs">
          This can take up to a minute. Please keep this page open.
        </p>
      )}
    </div>
  );
}

function GuestSuccess({
  itemTitle,
  email,
  delivered,
}: {
  itemTitle: string;
  email: string;
  delivered: boolean;
}) {
  const openSignIn = useConnectWalletDialogStore((state) => state.setIsOpen);
  return (
    <div
      role="status"
      className="grid content-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4"
    >
      <p className="flex items-start gap-2 font-semibold">
        <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
        {delivered
          ? `Done. It's yours: ${itemTitle}`
          : `Payment received. ${itemTitle} is on its way and will show up shortly.`}
      </p>
      <p className="text-fg-muted text-sm">
        It&apos;s in the Bandcoin account for{" "}
        <b className="text-fg [overflow-wrap:anywhere]">{email}</b>. To open it, sign in with Google
        or Apple using that email, or use &quot;Forgot password?&quot; to set a password.
      </p>
      <Button size="sm" className="justify-self-start" onClick={() => openSignIn(true)}>
        Sign in
      </Button>
    </div>
  );
}
