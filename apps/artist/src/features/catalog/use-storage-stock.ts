"use client";

import { api } from "~/trpc/react";

import { useWalletPayment } from "../payments/use-wallet-payment";

/** Paying to mint copies of an item into storage (see services/artist/storage-stock). */
export function useStorageStock(input: { itemId: string; quantity: number }) {
  const utils = api.useUtils();
  const start = api.profile.stockStart.useMutation();
  const submit = api.profile.stockSubmit.useMutation();
  const cancel = api.profile.stockCancel.useMutation();

  return useWalletPayment({
    start: () => start.mutateAsync(input),
    submit: (sent) => submit.mutateAsync(sent),
    cancel: (sent) => cancel.mutateAsync(sent),
    preparing: "Preparing your payment…",
    sending: "Adding the copies to your storage. This takes a few seconds.",
    success: {
      title: "Copies added",
      body: "Sales and pin claims take from storage first.",
    },
    onDone: () => utils.profile.stockQuote.invalidate(),
  });
}
