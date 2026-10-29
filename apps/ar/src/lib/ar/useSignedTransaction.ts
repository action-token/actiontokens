"use client";

import { useSession } from "next-auth/react";
import { type ReactNode, useRef, useState } from "react";

import { isAppError } from "@bandcoin/errors";
import {
  CUSTODIAL_COUNTDOWN_SECONDS,
  type TransactionStep,
} from "@bandcoin/ui/patterns/transaction-toast";
import { getWalletProvider, signTransaction } from "@bandcoin/wallet";

/**
 * The steps every Bandcoin payment goes through, for the AR app's claims:
 *
 *   email / Google / Apple accounts: countdown with Cancel → server signs → done
 *   wallet extensions:               "Confirm in Freighter" → wallet signs → done
 *
 * `prepare` returns the transaction and who signs it; `submit` sends it.
 */
export function useSignedTransaction(flow: {
  prepare: () => Promise<{ xdr: string; signer: "custodial" | "wallet" }>;
  submit: (xdr: string) => Promise<unknown>;
  /** Shown while the server submits. */
  sending: string;
  success: { title: string; body: string };
  /** Shown when the error has no message of its own. */
  failure: string;
  onDone?: () => Promise<unknown>;
}) {
  const session = useSession();
  const [step, setStep] = useState<TransactionStep | null>(null);
  const pending = useRef<string | null>(null);

  const busy =
    step !== null &&
    (step.kind === "countdown" || step.kind === "confirm" || step.kind === "submitting");
  const reasonOf = (error: unknown) =>
    isAppError(error) || error instanceof Error ? error.message : flow.failure;

  async function start(summary: ReactNode) {
    let prepared;
    try {
      setStep({ kind: "submitting", title: "Preparing your claim…", summary });
      prepared = await flow.prepare();
    } catch (error) {
      setStep({ kind: "failed", reason: reasonOf(error) });
      return;
    }
    pending.current = prepared.xdr;

    if (prepared.signer === "custodial") {
      setStep({ kind: "countdown", summary, seconds: CUSTODIAL_COUNTDOWN_SECONDS });
      return;
    }

    const user = session.data?.user;
    setStep({
      kind: "confirm",
      summary,
      walletName: getWalletProvider(user?.walletType ?? "")?.label ?? "your wallet",
    });
    let signed: string;
    try {
      signed = await signTransaction({
        xdr: prepared.xdr,
        publicKey: user?.walletAddress ?? "",
        walletType: user?.walletType ?? "",
      });
    } catch {
      if (pending.current === prepared.xdr) stop();
      return;
    }
    // Canceled while the wallet was open: the late signature is thrown away.
    if (pending.current !== prepared.xdr) return;
    await send(signed);
  }

  async function send(xdr = pending.current) {
    if (!xdr) return;
    setStep({ kind: "submitting", summary: flow.sending });
    try {
      await flow.submit(xdr);
      setStep({ kind: "success", ...flow.success });
      await flow.onDone?.();
    } catch (error) {
      setStep({ kind: "failed", reason: reasonOf(error) });
    } finally {
      pending.current = null;
    }
  }

  function stop() {
    pending.current = null;
    setStep({ kind: "canceled" });
  }

  return {
    step,
    busy,
    claim: (summary: ReactNode) => void start(summary),
    send: () => void send(),
    stop,
    reset: () => setStep(null),
  };
}
