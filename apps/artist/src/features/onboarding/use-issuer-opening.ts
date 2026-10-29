"use client";

import { api } from "~/trpc/react";

import { useWalletPayment } from "../payments/use-wallet-payment";

/** Paying to open the issuer account (see useWalletPayment for how the payment moves). */
export function useIssuerOpening() {
  const utils = api.useUtils();
  const start = api.onboarding.issuerStart.useMutation();
  const submit = api.onboarding.issuerSubmit.useMutation();
  const cancel = api.onboarding.issuerCancel.useMutation();

  return useWalletPayment({
    start: () => start.mutateAsync(),
    submit: (input) => submit.mutateAsync(input),
    cancel: (input) => cancel.mutateAsync(input),
    preparing: "Preparing your payment…",
    sending: "Opening your artist account. This takes a few seconds.",
    success: { title: "Your artist account is open", body: "An admin will review your page next." },
    onDone: () => Promise.all([utils.portal.status.invalidate(), utils.onboarding.issuerQuote.invalidate()]),
  });
}
