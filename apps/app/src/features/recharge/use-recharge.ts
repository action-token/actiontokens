"use client";

import { useSession } from "next-auth/react";
import { type ReactNode, useRef, useState } from "react";

import { isAppError } from "@bandcoin/errors";
import {
  CUSTODIAL_COUNTDOWN_SECONDS,
  type TransactionStep,
} from "@bandcoin/ui/patterns/transaction-toast";
import { getWalletProvider, signTransaction } from "@bandcoin/wallet";

import { api, type RouterInputs } from "~/trpc/react";

type RechargeInput = RouterInputs["recharge"]["start"];
type Card = { sourceId: string; verificationToken?: string };
type Pending = {
  orderId: string;
  xdr: string;
  card?: Card;
  success: { title: string; body: string };
};

const reasonOf = (error: unknown) =>
  isAppError(error) || error instanceof Error
    ? error.message
    : "Something went wrong. Nothing was charged.";

/**
 * One recharge, from the button to the money arriving. Moves a single toast
 * through its steps, like a purchase:
 *
 *   email / Google / Apple accounts: countdown with Cancel → server signs → done
 *   wallet extensions:               "Confirm in Freighter" → wallet signs → done
 *
 * Cancel (or a declined wallet popup) cancels the order, so nothing is signed,
 * sent or charged.
 */
export function useRecharge() {
  const session = useSession();
  const utils = api.useUtils();
  const start = api.recharge.start.useMutation();
  const submit = api.recharge.submit.useMutation();
  const cancel = api.recharge.cancel.useMutation();
  const [step, setStep] = useState<TransactionStep | null>(null);
  const pending = useRef<Pending | null>(null);

  const busy =
    step !== null &&
    (step.kind === "countdown" || step.kind === "confirm" || step.kind === "submitting");

  async function run(
    input: RechargeInput & { summary: ReactNode; card?: Card; success: Pending["success"] },
  ) {
    const { summary, card, success, ...recharge } = input;
    let started;
    try {
      setStep({
        kind: "submitting",
        title: "Preparing your order…",
        summary: "Locking in this price for 60 seconds.",
      });
      started = await start.mutateAsync(recharge);
    } catch (error) {
      setStep({ kind: "failed", reason: reasonOf(error) });
      return;
    }
    pending.current = { orderId: started.orderId, xdr: started.xdr, card, success };

    if (started.signer === "custodial") {
      setStep({ kind: "countdown", summary, seconds: CUSTODIAL_COUNTDOWN_SECONDS });
      return;
    }

    const user = session.data?.user;
    const walletName = getWalletProvider(user?.walletType ?? "")?.label ?? "your wallet";
    setStep({ kind: "confirm", summary, walletName });
    let signed: string;
    try {
      signed = await signTransaction({
        xdr: started.xdr,
        publicKey: user?.walletAddress ?? "",
        walletType: user?.walletType ?? "",
      });
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
    setStep({
      kind: "submitting",
      summary: "Sending it to your wallet. This takes a few seconds.",
    });
    try {
      await submit.mutateAsync({ orderId: order.orderId, xdr, card: order.card });
      setStep({ kind: "success", ...order.success });
      await Promise.all([utils.account.me.invalidate(), utils.recharge.quote.invalidate()]);
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

  return {
    step,
    busy,
    run,
    send: () => void send(),
    stop: () => void stop(),
    close: () => setStep(null),
  };
}
