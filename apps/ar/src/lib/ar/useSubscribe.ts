"use client";

import { type ReactNode, useRef } from "react";

import { api } from "~/trpc/react";

import { useSignedTransaction } from "./useSignedTransaction";

export type SubscribeCurrency = "ACTION" | "XLM" | "USDC" | "USD";
type CardToken = { sourceId: string; verificationToken?: string };

/**
 * Subscribing to an artist: trusting their fan token, paid in ACTION, XLM,
 * USDC or by card (plan 33). A card is charged only after the fan signed.
 */
export function useSubscribe(organizationId: string, code: string, currency: SubscribeCurrency) {
  const utils = api.useUtils();
  const start = api.subscribe.start.useMutation();
  const submit = api.subscribe.submit.useMutation();
  const cancel = api.subscribe.cancel.useMutation();
  const orderId = useRef<string | null>(null);
  const card = useRef<CardToken | undefined>(undefined);

  const flow = useSignedTransaction({
    preparing: "Preparing your subscription…",
    prepare: async () => {
      const started = await start.mutateAsync({ organizationId, currency });
      orderId.current = started.orderId;
      return started;
    },
    submit: (xdr) =>
      submit.mutateAsync({ orderId: orderId.current ?? "", xdr, card: card.current }),
    cancel: () =>
      orderId.current ? cancel.mutateAsync({ orderId: orderId.current }) : Promise.resolve(),
    sending: `Opening your ${code} line. This takes a few seconds.`,
    success: {
      title: `Subscribed. You now hold ${code}.`,
      body: "Their subscriber pins, posts and stories are open to you.",
    },
    failure: "Couldn't subscribe. Nothing was charged.",
    onDone: () =>
      Promise.all([
        utils.artist.list.invalidate(),
        utils.artist.byId.invalidate(),
        utils.pin.list.invalidate(),
        utils.subscribe.quote.invalidate(),
        utils.account.me.invalidate(),
      ]),
  });

  return {
    ...flow,
    /** `token` is the card's, taken from the form before anything starts. */
    claim: (summary: ReactNode, token?: CardToken) => {
      card.current = token;
      flow.claim(summary);
    },
  };
}
