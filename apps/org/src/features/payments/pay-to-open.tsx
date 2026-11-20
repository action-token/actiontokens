"use client";

import type { ReactNode } from "react";

import { Button } from "@actiontokens/ui/components/button";
import { ToastViewport, TransactionToast } from "@actiontokens/ui/patterns/transaction-toast";

import { Money } from "~/components/money";
import { api } from "~/trpc/react";

import { QuoteBreakdown, type XlmQuote } from "./quote-breakdown";
import type { useWalletPayment } from "./use-wallet-payment";

/**
 * Paying XLM for an account step (opening the issuer or storage, adding copies): what it is for, the full
 * price, then one button. Nothing is signed until it is pressed; custodial
 * wallets get the 5 second countdown with Cancel.
 */
export function PayToOpen({
  intro,
  quote,
  loading,
  flow,
  action,
}: {
  intro: ReactNode;
  quote: XlmQuote | undefined;
  loading: boolean;
  flow: ReturnType<typeof useWalletPayment>;
  /** "open it", "open storage": the end of "Pay 1.5 XLM and …" */
  action: string;
}) {
  const me = api.account.me.useQuery();
  const total = quote?.total;

  return (
    <div className="grid gap-4">
      <p className="text-fg-muted text-sm">{intro}</p>
      <QuoteBreakdown quote={quote} balance={me.data?.balances.XLM} loading={loading} />
      <Button
        disabled={!quote?.ok || flow.busy}
        onClick={() => void flow.run(total ? <Money amount={total} currency="XLM" /> : null)}
        className="justify-self-start"
      >
        {flow.busy ? (
          "Working…"
        ) : total ? (
          <>
            Pay <Money amount={total} currency="XLM" /> and {action}
          </>
        ) : (
          `Pay and ${action}`
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
