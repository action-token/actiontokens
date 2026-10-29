"use client";

import { useSession } from "next-auth/react";
import { type ReactNode, useRef, useState } from "react";

import { isAppError } from "@bandcoin/errors";
import { CUSTODIAL_COUNTDOWN_SECONDS, type TransactionStep } from "@bandcoin/ui/patterns/transaction-toast";
import { getWalletProvider, signTransaction } from "@bandcoin/wallet";

import { api } from "~/trpc/react";

type Pending = { orderId: string; xdr: string };

const reasonOf = (error: unknown) =>
  isAppError(error) || error instanceof Error ? error.message : "Something went wrong. Nothing was sent.";

/**
 * Paying to open the issuer account, from the button to the account existing.
 * Moves one toast through its steps, like every wallet payment:
 *
 *   email / Google / Apple accounts: countdown with Cancel → server signs → done
 *   wallet extensions:               "Confirm in Freighter" → wallet signs → done
 *
 * Cancel (or a declined wallet popup) cancels the order, so nothing is signed or sent.
 */
export function useIssuerOpening() {
  const session = useSession();
  const utils = api.useUtils();
  const start = api.onboarding.issuerStart.useMutation();
  const submit = api.onboarding.issuerSubmit.useMutation();
  const cancel = api.onboarding.issuerCancel.useMutation();
  const [step, setStep] = useState<TransactionStep | null>(null);
  const pending = useRef<Pending | null>(null);

  const busy = step !== null && (step.kind === "countdown" || step.kind === "confirm" || step.kind === "submitting");

  async function run(summary: ReactNode) {
    let started;
    try {
      setStep({ kind: "submitting", title: "Preparing your payment…", summary: "Locking in this price for 60 seconds." });
      started = await start.mutateAsync();
    } catch (error) {
      setStep({ kind: "failed", reason: reasonOf(error) });
      return;
    }
    pending.current = { orderId: started.orderId, xdr: started.xdr };

    if (started.signer === "custodial") {
      setStep({ kind: "countdown", summary, seconds: CUSTODIAL_COUNTDOWN_SECONDS });
      return;
    }

    const user = session.data?.user;
    const walletName = getWalletProvider(user?.walletType ?? "")?.label ?? "your wallet";
    setStep({ kind: "confirm", summary, walletName });
    let signed: string;
    try {
      signed = await signTransaction({ xdr: started.xdr, publicKey: user?.walletAddress ?? "", walletType: user?.walletType ?? "" });
    } catch {
      if (pending.current?.orderId === started.orderId) await stop();
      return;
    }
    // Canceled while the wallet was open: the late signature is thrown away.
    if (pending.current?.orderId !== started.orderId) return;
    await send(signed);
  }

  /** The countdown ran out (or "Send now"), or the wallet signed. */
  async function send(xdr = pending.current?.xdr) {
    const order = pending.current;
    if (!order || !xdr) return;
    setStep({ kind: "submitting", summary: "Opening your artist account. This takes a few seconds." });
    try {
      await submit.mutateAsync({ orderId: order.orderId, xdr });
      setStep({ kind: "success", title: "Your artist account is open", body: "An admin will review your page next." });
      await Promise.all([utils.portal.status.invalidate(), utils.onboarding.issuerQuote.invalidate()]);
    } catch (error) {
      setStep({ kind: "failed", reason: reasonOf(error) });
    } finally {
      pending.current = null;
    }
  }

  /** Cancel in the countdown, or the wallet popup was declined. */
  async function stop() {
    const order = pending.current;
    pending.current = null;
    setStep({ kind: "canceled" });
    if (order) await cancel.mutateAsync({ orderId: order.orderId }).catch(() => undefined);
  }

  return { step, busy, run, send: () => void send(), stop: () => void stop(), close: () => setStep(null) };
}
