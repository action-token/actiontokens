"use client";

import { useSession } from "next-auth/react";
import { useState } from "react";

import { Button } from "@actiontokens/ui/components/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@actiontokens/ui/components/tabs";
import { cn } from "@actiontokens/ui/lib/cn";
import { useConnectWalletDialogStore } from "@actiontokens/wallet";

import { Money } from "~/components/money";
import { payOf, shownLines } from "~/lib/recharge";
import { api, type RouterOutputs } from "~/trpc/react";

import { useSquareCard } from "../buy/square-card";
import { SwapForm } from "../wallet/swap-form";
import { useWalletOrder } from "../wallet/use-wallet-order";
import { ActivateWallet } from "./activate-wallet";
import { QuoteBreakdown } from "./quote-breakdown";
import { RechargeToast } from "./recharge-toast";
import { useRecharge as useRechargeFlow } from "./use-recharge";

type Quote = RouterOutputs["recharge"]["quote"];
type Tab = "top-up" | "swap";

/**
 * Recharge: two separate things, neither ever triggering the other. Add
 * ACTION with a card, or swap ACTION and XLM (the wallet's Swap). Each
 * shows the full price breakdown from the server before anything is signed
 * or charged.
 */
export function RechargeView() {
  const { status } = useSession();
  const me = api.account.me.useQuery(undefined, { enabled: status === "authenticated" });
  const [tab, setTab] = useState<Tab>("top-up");
  const flow = useRechargeFlow();
  const swapFlow = useWalletOrder();

  // A wallet that isn't on the network yet can't recharge: it activates first.
  if (me.data && !me.data.activated && me.data.walletAddress)
    return <ActivateWallet address={me.data.walletAddress} />;

  return (
    <section aria-label="Recharge" className="grid gap-6">
      <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
        <TabsList variant="line" className="w-full justify-start overflow-x-auto border-b">
          <TabsTrigger value="top-up" disabled={flow.busy || swapFlow.busy} className="flex-none">
            Add ACTION
          </TabsTrigger>
          <TabsTrigger value="swap" disabled={flow.busy || swapFlow.busy} className="flex-none">
            Swap
          </TabsTrigger>
        </TabsList>
        <TabsContent value="top-up" className="pt-5">
          <TopUp flow={flow} />
        </TabsContent>
        <TabsContent value="swap" className="pt-5">
          <div className="grid gap-6 md:grid-cols-2 md:gap-x-10">
            <div className="grid content-start gap-2">
              <h2 className="text-lg font-semibold">Swap ACTION and XLM</h2>
              <p className="text-fg-muted text-sm">
                XLM pays the small network fee for each action and keeps your wallet open. Swap any
                amount either way at today&apos;s price. Nothing is swapped unless you tap the
                button.
              </p>
            </div>
            <SwapForm flow={swapFlow} />
          </div>
        </TabsContent>
      </Tabs>

      <RechargeToast flow={flow} />
      <RechargeToast flow={swapFlow} />
    </section>
  );
}

type Flow = ReturnType<typeof useRechargeFlow>;

function TopUp({ flow }: { flow: Flow }) {
  const { status } = useSession();
  const openSignIn = useConnectWalletDialogStore((state) => state.setIsOpen);
  const options = api.recharge.options.useQuery(undefined, { staleTime: Infinity });
  const [packageUsd, setPackageUsd] = useState("9.99");
  const { container: cardField, ...card } = useSquareCard(status === "authenticated");
  const quote = api.recharge.quote.useQuery(
    { kind: "TOP_UP", packageUsd: packageUsd as "9.99" },
    {
      refetchInterval: 30_000,
      placeholderData: (previous) => previous,
      enabled: status !== "loading",
    },
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
          <Money amount={packageUsd} currency="USD" /> for{" "}
          <Money amount={quote.data.receive} currency="ACTION" />
        </>
      ),
      success: {
        title: "Done. ACTION is in your wallet.",
        body: "It can take a few seconds to show in your balance.",
      },
    });
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 md:gap-x-10">
      <div className="grid content-start gap-3">
        <span className="eyebrow">Choose an amount</span>
        <div
          role="group"
          aria-label="Top-up amount"
          className="grid grid-cols-2 gap-2 sm:grid-cols-3"
        >
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
        <p className="text-fg-faint text-xs">
          The ACTION you get is set by the live price when you pay, and shown below first.
        </p>
      </div>

      <div className="grid content-start gap-5">
        <QuoteBreakdown
          lines={quote.data ? shownLines(quote.data) : []}
          pay={quote.data ? payOf(quote.data) : null}
          problems={quote.data?.problems ?? []}
          loading={quote.isPending}
          error={quote.error?.message}
        />

        {status === "authenticated" && (
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
