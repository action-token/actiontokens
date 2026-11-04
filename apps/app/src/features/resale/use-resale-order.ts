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

type Job =
  | { kind: "list"; input: RouterInputs["resale"]["startList"] }
  | { kind: "cancel"; input: RouterInputs["resale"]["startCancel"] };
type Pending = { orderId: string; xdr: string; kind: Job["kind"]; done: Done };
type Done = { title: string; body: string };

const reasonOf = (error: unknown) =>
  isAppError(error) || error instanceof Error
    ? error.message
    : "Something went wrong. Nothing was changed.";

/**
 * One listing or take-back, from the button to "Done". The same steps as a
 * purchase: email / Google / Apple accounts get a countdown with Cancel and
 * Bandcoin signs; wallet extensions confirm in the wallet. Cancel (or a declined
 * wallet popup) stops the order, so nothing is signed or sent.
 */
export function useResaleOrder() {
  const session = useSession();
  const utils = api.useUtils();
  const startList = api.resale.startList.useMutation();
  const submitList = api.resale.submitList.useMutation();
  const startCancel = api.resale.startCancel.useMutation();
  const submitCancel = api.resale.submitCancel.useMutation();
  const cancelOrder = api.resale.cancelOrder.useMutation();
  const [step, setStep] = useState<TransactionStep | null>(null);
  const pending = useRef<Pending | null>(null);

  const busy =
    step !== null &&
    (step.kind === "countdown" || step.kind === "confirm" || step.kind === "submitting");

  async function run(job: Job & { summary: ReactNode; done: Done }) {
    let started;
    try {
      setStep({
        kind: "submitting",
        title: "Preparing…",
        summary: "Locking in the details for 60 seconds.",
      });
      started =
        job.kind === "list"
          ? await startList.mutateAsync(job.input)
          : await startCancel.mutateAsync(job.input);
    } catch (error) {
      setStep({ kind: "failed", reason: reasonOf(error) });
      return;
    }
    // Nothing left in storage: the listing just closed, with nothing to sign.
    if ("closed" in started && started.closed) {
      setStep({ kind: "success", title: job.done.title, body: job.done.body });
      await refresh();
      return;
    }
    pending.current = {
      orderId: started.orderId,
      xdr: started.xdr,
      kind: job.kind,
      done: job.done,
    };

    if (started.signer === "custodial") {
      setStep({ kind: "countdown", summary: job.summary, seconds: CUSTODIAL_COUNTDOWN_SECONDS });
      return;
    }

    const user = session.data?.user;
    const walletName = getWalletProvider(user?.walletType ?? "")?.label ?? "your wallet";
    setStep({ kind: "confirm", summary: job.summary, walletName });
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
    if (pending.current?.orderId !== started.orderId) return;
    await send(signed);
  }

  const refresh = () =>
    Promise.all([
      utils.resale.mine.invalidate(),
      utils.item.bySlug.invalidate(),
      utils.account.me.invalidate(),
      utils.collection.invalidate(),
    ]);

  /** The countdown ran out (or "Send now"), or the wallet signed. */
  async function send(xdr = pending.current?.xdr) {
    const order = pending.current;
    if (!order || !xdr) return;
    setStep({
      kind: "submitting",
      summary: "Sending it to the network. This takes a few seconds.",
    });
    try {
      const input = { orderId: order.orderId, xdr };
      if (order.kind === "list") await submitList.mutateAsync(input);
      else await submitCancel.mutateAsync(input);
      setStep({ kind: "success", title: order.done.title, body: order.done.body });
      await refresh();
    } catch (error) {
      setStep({ kind: "failed", reason: reasonOf(error) });
    } finally {
      pending.current = null;
    }
  }

  async function stop() {
    const order = pending.current;
    pending.current = null;
    setStep({ kind: "canceled" });
    if (order) await cancelOrder.mutateAsync({ orderId: order.orderId }).catch(() => undefined);
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
