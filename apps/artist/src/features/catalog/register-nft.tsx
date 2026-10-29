"use client";

import { Button } from "@bandcoin/ui/components/button";
import { ToastViewport, TransactionToast } from "@bandcoin/ui/patterns/transaction-toast";

import { Money } from "~/components/money";
import { api } from "~/trpc/react";

import { QuoteBreakdown } from "../payments/quote-breakdown";
import { useNftRegistration } from "./use-nft-registration";

/**
 * Step two for a contract NFT: register it on the contract. The artist pays
 * only the network fee (the platform authorises, never pays); the exact fee
 * comes from the contract itself, so it shows before anything is signed.
 */
export function RegisterNft({ itemId }: { itemId: string }) {
  const quote = api.catalog.nftQuote.useQuery({ itemId }, { refetchInterval: 30_000 });
  const me = api.account.me.useQuery();
  const flow = useNftRegistration(itemId);
  const total = quote.data?.total;

  return (
    <section className="bg-surface grid max-w-2xl gap-4 rounded-xl border p-5 sm:p-6">
      <div>
        <h2 className="display text-lg">Register it on Stellar</h2>
        <p className="text-fg-muted mt-1 text-sm">
          Your NFT is saved as a draft. Registering puts it on the contract so copies can be minted
          when fans buy. You pay the network fee below and nothing else.
        </p>
      </div>

      <QuoteBreakdown
        quote={quote.data}
        balance={me.data?.balances.XLM}
        loading={quote.isPending}
      />

      <Button
        disabled={!quote.data?.ok || flow.busy}
        onClick={() => void flow.run(total ? <Money amount={total} currency="XLM" /> : null)}
        className="justify-self-start"
      >
        {flow.busy ? (
          "Working…"
        ) : total ? (
          <>
            Pay <Money amount={total} currency="XLM" /> and register
          </>
        ) : (
          "Register"
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
    </section>
  );
}
