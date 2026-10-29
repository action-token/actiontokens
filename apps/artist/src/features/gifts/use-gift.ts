"use client";

import { api } from "~/trpc/react";

import { useWalletPayment } from "../payments/use-wallet-payment";

/** Sending a gift (see useWalletPayment for how the payment moves). */
export function useGift(input: { recipient: string; amount: number }, onSent: () => void) {
  const utils = api.useUtils();
  const start = api.gifts.start.useMutation();
  const submit = api.gifts.submit.useMutation();
  const cancel = api.gifts.cancel.useMutation();

  return useWalletPayment({
    start: () => start.mutateAsync(input),
    submit: (payload) => submit.mutateAsync(payload),
    cancel: (payload) => cancel.mutateAsync(payload),
    preparing: "Preparing your gift…",
    sending: "Sending your gift. This takes a few seconds.",
    success: { title: "Gift sent", body: "The tokens are in their wallet." },
    onDone: async () => {
      onSent();
      await Promise.all([
        utils.gifts.sent.invalidate(),
        utils.gifts.quote.invalidate(),
        utils.account.me.invalidate(),
        utils.admin.activity.list.invalidate(),
      ]);
    },
  });
}
