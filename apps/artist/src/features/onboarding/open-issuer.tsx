"use client";

import { Button } from "@bandcoin/ui/components/button";
import { ToastViewport, TransactionToast } from "@bandcoin/ui/patterns/transaction-toast";

import { Money } from "~/components/money";
import { api } from "~/trpc/react";

import { QuoteBreakdown } from "../payments/quote-breakdown";
import { useIssuerOpening } from "./use-issuer-opening";

/**
 * Step two: pay 1.5 XLM to open the account your music is issued from. The
 * full price shows first; nothing is signed until the button is pressed, and
 * custodial wallets get a 5 second countdown with Cancel.
 */
export function OpenIssuer() {
  const quote = api.onboarding.issuerQuote.useQuery(undefined, { refetchInterval: 30_000 });
  const me = api.account.me.useQuery();
  const flow = useIssuerOpening();
  const total = quote.data?.total;

  return (
    <section className="bg-surface grid max-w-xl gap-4 rounded-xl border p-5 sm:p-6">
      <p className="text-fg-muted text-sm">
        This opens the Stellar account every song and collectible you release is issued from. You keep paying for it
        yourself: Bandcoin never covers the cost. The price below is everything you pay.
      </p>

      <QuoteBreakdown quote={quote.data} balance={me.data?.balances.XLM} loading={quote.isPending} />

      <Button
        disabled={!quote.data?.ok || flow.busy}
        onClick={() => void flow.run(total ? <Money amount={total} currency="XLM" /> : null)}
        className="justify-self-start"
      >
        {flow.busy ? "Working…" : total ? <>Pay <Money amount={total} currency="XLM" /> and open it</> : "Pay and open it"}
      </Button>

      {flow.step && (
        <ToastViewport>
          <TransactionToast
            key={flow.step.kind}
            step={flow.step}
            onSend={flow.send}
            onCancel={flow.stop}
            actions={
              <Button size="sm" variant="secondary" className="h-8 px-3 text-[13px]" onClick={flow.step.kind === "confirm" ? flow.stop : flow.close}>
                {flow.step.kind === "confirm" ? "Cancel" : "Close"}
              </Button>
            }
          />
        </ToastViewport>
      )}
    </section>
  );
}
