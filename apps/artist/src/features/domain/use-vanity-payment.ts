"use client";

import { api, type RouterInputs } from "~/trpc/react";

import { useWalletPayment } from "../payments/use-wallet-payment";

export type VanityPayInput = RouterInputs["vanity"]["start"];

/** Paying for the link: another month, or a new name (see useWalletPayment for how the payment moves). */
export function useVanityPayment(input: VanityPayInput, onDone: () => void) {
  const utils = api.useUtils();
  const start = api.vanity.start.useMutation();
  const submit = api.vanity.submit.useMutation();
  const cancel = api.vanity.cancel.useMutation();

  return useWalletPayment({
    start: () => start.mutateAsync(input),
    submit: (payload) => submit.mutateAsync(payload),
    cancel: (payload) => cancel.mutateAsync(payload),
    preparing: "Preparing your payment…",
    sending: "Paying. This takes a few seconds.",
    success:
      input.purpose === "RENEWAL"
        ? { title: "Link renewed", body: "Your link is paid for another month." }
        : { title: "Name changed", body: "Your link now uses the new name." },
    onDone: async () => {
      onDone();
      await Promise.all([
        utils.vanity.overview.invalidate(),
        utils.vanity.quote.invalidate(),
        utils.account.me.invalidate(),
        utils.admin.activity.list.invalidate(),
      ]);
    },
  });
}
