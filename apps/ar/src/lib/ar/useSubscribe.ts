"use client";

import { useRef } from "react";

import { api } from "~/trpc/react";

import { useSignedTransaction } from "./useSignedTransaction";

/** Subscribing to an artist: trusting their fan token, paid in BANDCOIN. */
export function useSubscribe(artistId: string, code: string) {
  const utils = api.useUtils();
  const start = api.subscribe.start.useMutation();
  const submit = api.subscribe.submit.useMutation();
  const cancel = api.subscribe.cancel.useMutation();
  const orderId = useRef<string | null>(null);

  return useSignedTransaction({
    preparing: "Preparing your subscription…",
    prepare: async () => {
      const started = await start.mutateAsync({ artistId });
      orderId.current = started.orderId;
      return started;
    },
    submit: (xdr) => submit.mutateAsync({ orderId: orderId.current ?? "", xdr }),
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
}
