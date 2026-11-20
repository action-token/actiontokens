"use client";

import { useSession } from "next-auth/react";
import { type ReactNode, useRef, useState } from "react";

import { isAppError } from "@actiontokens/errors";
import { Button } from "@actiontokens/ui/components/button";
import {
  CUSTODIAL_COUNTDOWN_SECONDS,
  ToastViewport,
  TransactionToast,
  type TransactionStep,
} from "@actiontokens/ui/patterns/transaction-toast";
import { getWalletProvider, signTransaction } from "@actiontokens/wallet";

type Prepared = { xdr: string; signer: "custodial" | "wallet" };

/**
 * One claim, from the button to it being done: accepting a gift, or taking
 * back something nobody accepted. Moves a single toast through the usual
 * steps: countdown with Cancel for email/Google/Apple accounts, "Confirm in
 * your wallet" for wallet extensions. Canceling sends nothing.
 */
export function useClaimFlow(config: {
  prepare: (id: string) => Promise<Prepared>;
  submit: (input: { id: string; xdr: string }) => Promise<unknown>;
  preparing: string;
  sending: string;
  success: { title: string; body: string };
  /** Shown when a failure has no message of its own */
  failed: string;
  onDone: () => Promise<unknown>;
}) {
  const session = useSession();
  const [step, setStep] = useState<TransactionStep | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const pending = useRef<{ id: string; xdr: string } | null>(null);

  const busy =
    step !== null &&
    (step.kind === "countdown" || step.kind === "confirm" || step.kind === "submitting");
  const reasonOf = (error: unknown) =>
    isAppError(error) || error instanceof Error ? error.message : config.failed;

  async function run(id: string, summary: ReactNode) {
    setCurrent(id);
    let prepared: Prepared;
    try {
      setStep({ kind: "submitting", title: config.preparing, summary });
      prepared = await config.prepare(id);
    } catch (error) {
      setStep({ kind: "failed", reason: reasonOf(error) });
      return;
    }
    pending.current = { id, xdr: prepared.xdr };
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
      if (pending.current?.xdr === prepared.xdr) stop();
      return;
    }
    // Canceled while the wallet was open: the late signature is thrown away.
    if (pending.current?.xdr !== prepared.xdr) return;
    await send(signed);
  }

  /** The countdown ran out (or "Send now"), or the wallet signed. */
  async function send(xdr = pending.current?.xdr) {
    const claim = pending.current;
    if (!claim || !xdr) return;
    setStep({ kind: "submitting", summary: config.sending });
    try {
      await config.submit({ id: claim.id, xdr });
      setStep({ kind: "success", ...config.success });
      await config.onDone();
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
    /** The row the flow is working on, for its spinner */
    current,
    run: (id: string, summary: ReactNode) => void run(id, summary),
    send: () => void send(),
    stop,
    close: () => setStep(null),
  };
}

/** The toast for a claim flow. */
export function ClaimToast({ flow }: { flow: ReturnType<typeof useClaimFlow> }) {
  if (!flow.step) return null;
  const confirming = flow.step.kind === "confirm";
  return (
    <ToastViewport>
      <TransactionToast
        key={flow.step.kind}
        step={flow.step}
        onSend={flow.send}
        onCancel={flow.stop}
        actions={
          <Button
            size="sm"
            variant={confirming ? "secondary" : "ghost"}
            className="h-8 px-3 text-[13px]"
            onClick={confirming ? flow.stop : flow.close}
          >
            {confirming ? "Cancel" : "Close"}
          </Button>
        }
      />
    </ToastViewport>
  );
}
