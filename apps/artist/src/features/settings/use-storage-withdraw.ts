"use client";

import { api } from "~/trpc/react";

import { useWalletPayment } from "../payments/use-wallet-payment";

/** Paying to move something from storage into the wallet (see services/artist/storage-withdraw). */
export function useStorageWithdraw(input: { code: string; issuer: string | null; amount: string }) {
  const utils = api.useUtils();
  const start = api.profile.withdrawStart.useMutation();
  const submit = api.profile.withdrawSubmit.useMutation();
  const cancel = api.profile.withdrawCancel.useMutation();

  return useWalletPayment({
    start: () => start.mutateAsync(input),
    submit: (sent) => submit.mutateAsync(sent),
    cancel: (sent) => cancel.mutateAsync(sent),
    preparing: "Preparing your payment…",
    sending: "Moving it to your wallet. This takes a few seconds.",
    success: { title: "Moved to your wallet", body: "It's in your own wallet now." },
    onDone: () =>
      Promise.all([
        utils.profile.storageContents.invalidate(),
        utils.profile.stockQuote.invalidate(),
        utils.account.me.invalidate(),
      ]),
  });
}
