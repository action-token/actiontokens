"use client";

import { CircleAlert } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useState } from "react";

import { Button } from "@bandcoin/ui/components/button";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@bandcoin/ui/components/tabs";
import { cn } from "@bandcoin/ui/lib/cn";
import { PriceBreakdown, ShortfallNotice } from "@bandcoin/ui/patterns/price-breakdown";
import { ToastViewport, TransactionToast } from "@bandcoin/ui/patterns/transaction-toast";
import { useConnectWalletDialogStore } from "@bandcoin/wallet";

import { Money } from "~/components/money";
import { payOf, shownLines } from "~/lib/recharge";
import { api, type RouterOutputs } from "~/trpc/react";

import { useSquareCard } from "../buy/square-card";
import { useRecharge as useRechargeFlow } from "./use-recharge";

type Quote = RouterOutputs["recharge"]["quote"];
type Tab = "top-up" | "xlm";

/**
 * Recharge: two separate things, neither ever triggering the other. Add
 * BANDCOIN with a card, or pay BANDCOIN for 1 XLM. Each shows the full price
 * breakdown from the server before anything is signed or charged.
 */
export function RechargeView() {
  const [tab, setTab] = useState<Tab>("top-up");
  const flow = useRechargeFlow();

  return (
    <section aria-label="Recharge" className="grid gap-6">
      <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
        <TabsList className="grid w-full max-w-sm grid-cols-2">
          <TabsTrigger value="top-up" disabled={flow.busy}>
            Add BANDCOIN
          </TabsTrigger>
          <TabsTrigger value="xlm" disabled={flow.busy}>
            Get XLM
          </TabsTrigger>
        </TabsList>
        <TabsContent value="top-up" className="pt-5">
          <TopUp flow={flow} />
        </TabsContent>
        <TabsContent value="xlm" className="pt-5">
          <XlmSwap flow={flow} onAddBandcoin={() => setTab("top-up")} />
        </TabsContent>
      </Tabs>

      {flow.step && (
        <ToastViewport>
          <TransactionToast
            key={flow.step.kind}
            step={flow.step}
            onSend={flow.send}
            onCancel={flow.stop}
            actions={
              flow.step.kind === "success" ? (
                <>
                  <Button asChild size="sm" variant="secondary" className="h-8 px-3 text-[13px]">
                    <Link href="/wallet">View wallet</Link>
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 px-3 text-[13px]" onClick={flow.close}>
                    Close
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-8 px-3 text-[13px]"
                  onClick={flow.step.kind === "confirm" ? flow.stop : flow.close}
                >
                  {flow.step.kind === "confirm" ? "Cancel" : "Close"}
                </Button>
              )
            }
          />
        </ToastViewport>
      )}
    </section>
  );
}

type Flow = ReturnType<typeof useRechargeFlow>;

function TopUp({ flow }: { flow: Flow }) {
  const { status } = useSession();
  const openSignIn = useConnectWalletDialogStore((state) => state.setIsOpen);
  const options = api.recharge.options.useQuery(undefined, { staleTime: Infinity });
  const [packageUsd, setPackageUsd] = useState("9.99");
  const me = api.account.me.useQuery(undefined, { enabled: status === "authenticated" });
  const { container: cardField, ...card } = useSquareCard(status === "authenticated");
  const quote = api.recharge.quote.useQuery(
    { kind: "TOP_UP", packageUsd: packageUsd as "9.99" },
    { refetchInterval: 30_000, placeholderData: (previous) => previous, enabled: status !== "loading" },
  );

  async function pay() {
    if (quote.data?.kind !== "TOP_UP" || !quote.data.ok) return;
    const cardToken = await card.tokenize();
    if (!cardToken) return;
    await flow.run({
      kind: "TOP_UP",
      packageUsd: packageUsd as "9.99",
      card: cardToken,
      summary: (
        <>
          <Money amount={packageUsd} currency="USD" /> for <Money amount={quote.data.receive} currency="BANDCOIN" />
        </>
      ),
      success: { title: "Done. BANDCOIN is in your wallet.", body: "It can take a few seconds to show in your balance." },
    });
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 md:gap-x-10">
      <div className="grid content-start gap-3">
        <span className="eyebrow">Choose an amount</span>
        <div role="group" aria-label="Top-up amount" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {(options.data?.packagesUsd ?? []).map((usd) => (
            <button
              key={usd}
              type="button"
              disabled={flow.busy}
              aria-pressed={usd === packageUsd}
              onClick={() => setPackageUsd(usd)}
              className={cn(
                "bg-surface-2 hover:border-border-strong rounded-md border p-3 text-left transition-colors",
                usd === packageUsd && "border-primary-text bg-primary-soft",
              )}
            >
              <b className="num text-[15px]">${usd}</b>
              <span className="text-fg-muted block text-[11px]">Debit or credit</span>
            </button>
          ))}
        </div>
        <p className="text-fg-faint text-xs">The BANDCOIN you get is set by the live price when you pay, and shown below first.</p>
      </div>

      <div className="grid content-start gap-5">
        <Breakdown quote={quote.data} loading={quote.isPending} error={quote.error?.message} balances={me.data?.balances} />

        {status === "authenticated" && (
          <div className="grid gap-1.5">
            <div ref={cardField} className={cn("min-h-[90px]", card.loading && "bg-surface-2 animate-pulse rounded-md")} />
            {card.error && <p className="text-danger text-xs">{card.error}</p>}
          </div>
        )}

        <PayButton
          quote={quote.data}
          signedOut={status === "unauthenticated"}
          busy={flow.busy || quote.isFetching}
          disabled={!card.ready}
          label={`Pay $${packageUsd}`}
          onSignIn={() => openSignIn(true)}
          onPay={() => void pay()}
        />
      </div>
    </div>
  );
}

function XlmSwap({ flow, onAddBandcoin }: { flow: Flow; onAddBandcoin: () => void }) {
  const { status } = useSession();
  const openSignIn = useConnectWalletDialogStore((state) => state.setIsOpen);
  const me = api.account.me.useQuery(undefined, { enabled: status === "authenticated" });
  const quote = api.recharge.quote.useQuery(
    { kind: "XLM_SWAP" },
    { refetchInterval: 30_000, placeholderData: (previous) => previous, enabled: status !== "loading" },
  );

  async function pay() {
    if (quote.data?.kind !== "XLM_SWAP" || !quote.data.ok) return;
    await flow.run({
      kind: "XLM_SWAP",
      summary: (
        <>
          <Money amount={quote.data.total} currency="BANDCOIN" /> for <Money amount={quote.data.receiveXlm} currency="XLM" />
        </>
      ),
      success: { title: "Done. 1 XLM is in your wallet.", body: "It can take a few seconds to show in your balance." },
    });
  }

  const needsBandcoin = quote.data?.problems.some((problem) => problem.code === "INSUFFICIENT_FUNDS");

  return (
    <div className="grid gap-6 md:grid-cols-2 md:gap-x-10">
      <div className="grid content-start gap-2">
        <h2 className="text-lg font-semibold">1 XLM for your wallet</h2>
        <p className="text-fg-muted text-sm">
          XLM pays the small network fee for each action and keeps your wallet open. You pay in BANDCOIN at today&apos;s price,
          and nothing is swapped unless you tap the button.
        </p>
      </div>

      <div className="grid content-start gap-5">
        <Breakdown quote={quote.data} loading={quote.isPending} error={quote.error?.message} balances={me.data?.balances} />
        {needsBandcoin ? (
          <Button size="lg" variant="secondary" onClick={onAddBandcoin}>
            Add BANDCOIN with a card
          </Button>
        ) : (
          <PayButton
            quote={quote.data}
            signedOut={status === "unauthenticated"}
            busy={flow.busy || quote.isFetching}
            label="Get 1 XLM"
            onSignIn={() => openSignIn(true)}
            onPay={() => void pay()}
          />
        )}
      </div>
    </div>
  );
}

function Breakdown({
  quote,
  loading,
  error,
  balances,
}: {
  quote: Quote | undefined;
  loading: boolean;
  error?: string;
  balances?: Record<"BANDCOIN" | "XLM" | "USDC", string>;
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
  if (error || !quote) return <Problem message={error ?? "Couldn't get the price. Try again in a moment."} />;

  const pay = payOf(quote);
  const shortfalls = quote.problems.flatMap((problem) => (problem.code === "INSUFFICIENT_FUNDS" ? [problem.shortfall] : []));
  const notices = quote.problems.filter((problem) => problem.code === "UNAVAILABLE" || problem.code === "RATE_UNAVAILABLE");
  const paying = quote.kind === "XLM_SWAP" ? "BANDCOIN" : null;
  const short = shortfalls.find((shortfall) => shortfall.currency === paying);

  return (
    <>
      {pay && (
        <PriceBreakdown
          lines={shownLines(quote).map((line) => ({
            label: line.label,
            value: <Money amount={line.amount} currency={line.currency} />,
          }))}
          total={<Money amount={pay.amount} currency={pay.currency} />}
          balance={
            paying && balances
              ? {
                  value: <Money amount={balances[paying]} currency={paying} />,
                  shortBy: short ? <Money amount={short.short} currency={short.currency} /> : undefined,
                }
              : undefined
          }
        />
      )}
      {shortfalls.map((shortfall) => (
        <ShortfallNotice
          key={shortfall.currency}
          currency={shortfall.currency}
          shortBy={<Money amount={shortfall.short} currency={shortfall.currency} />}
        />
      ))}
      {notices.map((problem) => (
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
  busy,
  disabled,
  label,
  onSignIn,
  onPay,
}: {
  quote: Quote | undefined;
  signedOut: boolean;
  busy: boolean;
  disabled?: boolean;
  label: string;
  onSignIn: () => void;
  onPay: () => void;
}) {
  // The quote decides: a stale browser session still gets "Sign in".
  if (signedOut || quote?.problems.some((problem) => problem.code === "SIGN_IN")) {
    return (
      <Button size="lg" onClick={onSignIn}>
        Sign in to recharge
      </Button>
    );
  }
  if (!quote) {
    return (
      <Button size="lg" disabled>
        Getting the price…
      </Button>
    );
  }
  return (
    <Button size="lg" disabled={!quote.ok || busy || disabled} onClick={onPay}>
      {quote.ok ? label : "Can't recharge right now"}
    </Button>
  );
}
