"use client";

import { api } from "~/trpc/react";

import { useWalletPayment } from "../payments/use-wallet-payment";

/** Paying to open the optional storage account (see services/artist/storage-account). */
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
      body: "Send BANDCOIN, XLM or USDC to it, then fund bounty prizes from it.",
    },
    onDone: () =>
      Promise.all([utils.profile.overview.invalidate(), utils.profile.storageQuote.invalidate()]),
  });
}
