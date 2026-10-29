"use client";

import { api } from "~/trpc/react";

import { useWalletPayment } from "../payments/use-wallet-payment";

/** Paying the network fee to register a contract NFT (see useWalletPayment for how the payment moves). */
export function useNftRegistration(itemId: string) {
  const utils = api.useUtils();
  const start = api.catalog.nftStart.useMutation();
  const submit = api.catalog.nftSubmit.useMutation();
  const cancel = api.catalog.nftCancel.useMutation();

  return useWalletPayment({
    start: () => start.mutateAsync({ itemId }),
    submit: (input) => submit.mutateAsync(input),
    cancel: (input) => cancel.mutateAsync(input),
    preparing: "Preparing the registration…",
    sending: "Registering your NFT. This takes a few seconds.",
    success: {
      title: "Your NFT is registered",
      body: "It lives on the contract now. Selling it opens soon.",
    },
    onDone: () =>
      Promise.all([
        utils.catalog.get.invalidate({ itemId }),
        utils.catalog.nftQuote.invalidate({ itemId }),
        utils.catalog.list.invalidate(),
      ]),
  });
}
