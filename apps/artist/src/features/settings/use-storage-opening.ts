"use client";

import { api } from "~/trpc/react";

import { useWalletPayment } from "../payments/use-wallet-payment";

/** Paying to open the storage account, where copies wait (see services/artist/storage-account). */
export function useStorageOpening() {
  const utils = api.useUtils();
  const start = api.profile.storageStart.useMutation();
  const submit = api.profile.storageSubmit.useMutation();
  const cancel = api.profile.storageCancel.useMutation();

  return useWalletPayment({
    start: () => start.mutateAsync(),
    submit: (input) => submit.mutateAsync(input),
    cancel: (input) => cancel.mutateAsync(input),
    preparing: "Preparing your payment…",
    sending: "Opening your storage account. This takes a few seconds.",
    success: {
      title: "Your storage account is open",
      body: "Add copies to it from each item's page. Sales and pin claims take from it first.",
    },
    onDone: () =>
      Promise.all([utils.profile.overview.invalidate(), utils.profile.storageQuote.invalidate()]),
  });
}
