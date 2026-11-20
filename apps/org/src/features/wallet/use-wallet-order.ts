"use client";

import { useSession } from "next-auth/react";
import { type ReactNode, useRef, useState } from "react";

import { isAppError } from "@actiontokens/errors";
import {
  CUSTODIAL_COUNTDOWN_SECONDS,
  type TransactionStep,
} from "@actiontokens/ui/patterns/transaction-toast";
import { getWalletProvider, signTransaction } from "@actiontokens/wallet";

import { api, type RouterInputs } from "~/trpc/react";

type Order =
  | { kind: "send"; input: RouterInputs["wallet"]["send"]["start"] }
  | { kind: "swap"; input: RouterInputs["wallet"]["swap"]["start"] };
type Pending = { kind: Order["kind"]; orderId: string; xdr: string; success: Success };
type Success = { title: string; body: string };

const reasonOf = (error: unknown) =>
  isAppError(error) || error instanceof Error
    ? error.message
    : "Something went wrong. Nothing was sent.";

/**
 * One Send or Swap, from the button to the money arriving, in one toast, like
 * Recharge: email / Google / Apple accounts get the countdown with Cancel (the
 * server signs when it runs out); wallet extensions ask the wallet to sign.
 * Cancel or a declined wallet cancels the order, so nothing is sent.
 */
export function useWalletOrder() {
  const session = useSession();
  const utils = api.useUtils();
  const mutations = {
    send: {
      start: api.wallet.send.start.useMutation(),
      submit: api.wallet.send.submit.useMutation(),
      cancel: api.wallet.send.cancel.useMutation(),
    },
    swap: {
      start: api.wallet.swap.start.useMutation(),
      submit: api.wallet.swap.submit.useMutation(),
      cancel: api.wallet.swap.cancel.useMutation(),
    },
  };
  const [step, setStep] = useState<TransactionStep | null>(null);
  const pending = useRef<Pending | null>(null);

  const busy =
    step !== null &&
    (step.kind === "countdown" || step.kind === "confirm" || step.kind === "submitting");

  async function run(order: Order & { summary: ReactNode; success: Success }) {
    const { summary, success } = order;
    let started;
    try {
      setStep({
        kind: "submitting",
        title: "Preparing it…",
        summary: "Locking in these amounts for 60 seconds.",
      });
      started =
        order.kind === "send"
          ? await mutations.send.start.mutateAsync(order.input)
          : await mutations.swap.start.mutateAsync(order.input);
    } catch (error) {
      setStep({ kind: "failed", reason: reasonOf(error) });
      return;
    }
    pending.current = { kind: order.kind, orderId: started.orderId, xdr: started.xdr, success };

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
    setStep({ kind: "submitting", summary: "Sending it. This takes a few seconds." });
    try {
      await mutations[order.kind].submit.mutateAsync({ orderId: order.orderId, xdr });
      setStep({ kind: "success", ...order.success });
      await Promise.all([
        utils.account.me.invalidate(),
        utils.wallet.assets.invalidate(),
        utils.wallet.history.invalidate(),
        utils.wallet.sentWaiting.invalidate(),
      ]);
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
    if (order)
      await mutations[order.kind].cancel
        .mutateAsync({ orderId: order.orderId })
        .catch(() => undefined);
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

export type WalletOrderFlow = ReturnType<typeof useWalletOrder>;
