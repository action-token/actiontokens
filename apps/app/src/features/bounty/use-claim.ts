"use client";

import { useSession } from "next-auth/react";
import { type ReactNode, useRef, useState } from "react";

import { isAppError } from "@bandcoin/errors";
import {
  CUSTODIAL_COUNTDOWN_SECONDS,
  type TransactionStep,
} from "@bandcoin/ui/patterns/transaction-toast";
import { getWalletProvider, signTransaction } from "@bandcoin/wallet";

import { api } from "~/trpc/react";

const reasonOf = (error: unknown) =>
  isAppError(error) || error instanceof Error
    ? error.message
    : "Couldn't claim the prize. Nothing was sent.";

/**
 * Claiming a bounty prize from the escrow, with the same toast as buying:
 *
 *   email / Google / Apple accounts: countdown with Cancel → server signs → done
 *   wallet extensions:               "Confirm in Freighter" → wallet signs → done
 */
export function useClaim(bountyId: string) {
  const session = useSession();
  const utils = api.useUtils();
  const prepare = api.bounty.claimPrepare.useMutation();
  const submit = api.bounty.claimSubmit.useMutation();
  const [step, setStep] = useState<TransactionStep | null>(null);
  const pending = useRef<string | null>(null);

  const busy =
    step !== null &&
    (step.kind === "countdown" || step.kind === "confirm" || step.kind === "submitting");

  async function claim(summary: ReactNode) {
    let prepared;
    try {
      setStep({ kind: "submitting", title: "Preparing your claim…", summary });
      prepared = await prepare.mutateAsync({ bountyId });
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
    setStep({
      kind: "submitting",
      summary: "Sending your prize to your wallet. This takes a few seconds.",
    });
    try {
      await submit.mutateAsync({ bountyId, xdr });
      setStep({ kind: "success", title: "Prize claimed", body: "It's in your wallet now." });
      await Promise.all([
        utils.bounty.byId.invalidate({ bountyId }),
        utils.account.me.invalidate(),
      ]);
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
    close: () => setStep(null),
  };
}
