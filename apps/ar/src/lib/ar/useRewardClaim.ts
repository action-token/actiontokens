"use client";

import { useSession } from "next-auth/react";
import { type ReactNode, useRef, useState } from "react";

import { isAppError } from "@bandcoin/errors";
import { CUSTODIAL_COUNTDOWN_SECONDS, type TransactionStep } from "@bandcoin/ui/patterns/transaction-toast";
import { getWalletProvider, signTransaction } from "@bandcoin/wallet";

import { api } from "~/trpc/react";

const reasonOf = (error: unknown) =>
  isAppError(error) || error instanceof Error ? error.message : "Couldn't claim the reward. Nothing was sent.";

/**
 * Claiming a pin's reward to the wallet, with the same steps as every other
 * Bandcoin payment:
 *
 *   email / Google / Apple accounts: countdown with Cancel → server signs → done
 *   wallet extensions:               "Confirm in Freighter" → wallet signs → done
 */
export function useRewardClaim(claimId: string) {
  const session = useSession();
  const utils = api.useUtils();
  const prepare = api.claim.prepare.useMutation();
  const submit = api.claim.submit.useMutation();
  const [step, setStep] = useState<TransactionStep | null>(null);
  const pending = useRef<string | null>(null);

  const busy = step !== null && (step.kind === "countdown" || step.kind === "confirm" || step.kind === "submitting");

  async function claim(summary: ReactNode) {
    let prepared;
    try {
      setStep({ kind: "submitting", title: "Preparing your claim…", summary });
      prepared = await prepare.mutateAsync({ claimId });
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
    setStep({ kind: "confirm", summary, walletName: getWalletProvider(user?.walletType ?? "")?.label ?? "your wallet" });
    let signed: string;
    try {
      signed = await signTransaction({ xdr: prepared.xdr, publicKey: user?.walletAddress ?? "", walletType: user?.walletType ?? "" });
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
    setStep({ kind: "submitting", summary: "Sending the reward to your wallet. This takes a few seconds." });
    try {
      await submit.mutateAsync({ claimId, xdr });
      setStep({ kind: "success", title: "Reward claimed", body: "It's in your Stellar wallet now." });
      await Promise.all([utils.claim.forPin.invalidate(), utils.claim.quote.invalidate({ claimId }), utils.account.me.invalidate()]);
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
    claim: (summary: ReactNode) => void claim(summary),
    send: () => void send(),
    stop,
    reset: () => setStep(null),
  };
}
