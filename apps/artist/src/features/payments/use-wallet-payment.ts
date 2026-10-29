"use client";

import { useSession } from "next-auth/react";
import { type ReactNode, useRef, useState } from "react";

import { isAppError } from "@bandcoin/errors";
import { CUSTODIAL_COUNTDOWN_SECONDS, type TransactionStep } from "@bandcoin/ui/patterns/transaction-toast";
import { getWalletProvider, signTransaction } from "@bandcoin/wallet";

type Started = { orderId: string; xdr: string; signer: "custodial" | "wallet" };
type Pending = { orderId: string; xdr: string };

const reasonOf = (error: unknown) =>
  isAppError(error) || error instanceof Error ? error.message : "Something went wrong. Nothing was sent.";

/**
 * One wallet payment, from the button to it being done. Moves a single toast
 * through its steps, like every payment in Bandcoin:
 *
 *   email / Google / Apple accounts: countdown with Cancel → server signs → done
 *   wallet extensions:               "Confirm in Freighter" → wallet signs → done
 *
 * Cancel (or a declined wallet popup) cancels the order, so nothing is signed or sent.
 * The caller supplies the three server calls and what to show when it works.
 */
export function useWalletPayment(steps: {
  start: () => Promise<Started>;
  submit: (input: { orderId: string; xdr: string }) => Promise<unknown>;
  cancel: (input: { orderId: string }) => Promise<unknown>;
  preparing: string;
  sending: string;
  success: { title: string; body: string };
  onDone: () => Promise<unknown> | void;
}) {
  const session = useSession();
  const [step, setStep] = useState<TransactionStep | null>(null);
  const pending = useRef<Pending | null>(null);

  const busy = step !== null && (step.kind === "countdown" || step.kind === "confirm" || step.kind === "submitting");

  async function run(summary: ReactNode) {
    let started: Started;
    try {
      setStep({ kind: "submitting", title: steps.preparing, summary: "Locking in this price for 60 seconds." });
      started = await steps.start();
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
    setStep({ kind: "submitting", summary: steps.sending });
    try {
      await steps.submit({ orderId: order.orderId, xdr });
      setStep({ kind: "success", ...steps.success });
      await steps.onDone();
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
    if (order) await steps.cancel({ orderId: order.orderId }).catch(() => undefined);
  }

  return { step, busy, run, send: () => void send(), stop: () => void stop(), close: () => setStep(null) };
}
