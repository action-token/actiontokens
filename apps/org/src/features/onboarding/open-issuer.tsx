"use client";

import { api } from "~/trpc/react";

import { PayToOpen } from "../payments/pay-to-open";
import { useIssuerOpening } from "./use-issuer-opening";

/**
 * Pay 1.5 XLM to open the account your music is issued from: step two of
 * onboarding, or from Settings for an artist approved before paying.
 */
export function OpenIssuer({ approved = false }: { approved?: boolean }) {
  const quote = api.onboarding.issuerQuote.useQuery(undefined, { refetchInterval: 30_000 });
  const flow = useIssuerOpening({ approved });
  const panel = (
    <PayToOpen
      intro="This opens the Stellar account every song and collectible you release is issued from. You pay for it yourself: Action Tokens never covers the cost. The price below is everything you pay."
      quote={quote.data}
      loading={quote.isPending}
      flow={flow}
      action="open it"
    />
  );
  // In Settings it sits inside the account's own card.
  if (approved) return panel;
  return <section className="bg-surface grid gap-4 rounded-xl border p-5 sm:p-6">{panel}</section>;
}
