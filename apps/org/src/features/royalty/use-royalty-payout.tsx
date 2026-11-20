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

export type PayoutInput = RouterInputs["royalty"]["start"];

type Batch = { batchNo: number; xdr: string };
type Started = { payoutId: string; batches: Batch[]; signer: "custodial" | "wallet" };

/** The wallet popup was closed or declined. */
class Declined extends Error {}

const reasonOf = (error: unknown) =>
  isAppError(error) || error instanceof Error
    ? error.message
    : "Something went wrong. Nothing was sent.";

/**
 * A royalty payout, from the button to everyone being paid. One toast moves
 * through the steps like every payment, but the money goes out in batches of up
 * to 100 holders, so the artist approves each batch in turn:
 *
 *   email / Google / Apple accounts: one countdown with Cancel → the server signs every batch
 *   wallet extensions:               "part 2 of 3" when over 100 fans
 *
 * Cancel (or a declined wallet popup) before the first batch drops the payout. Once a
 * batch is out, the payout stays in the list as partial and `resume` finishes it.
 */
export function useRoyaltyPayout(onDone: () => void) {
  const session = useSession();
  const utils = api.useUtils();
  const start = api.royalty.start.useMutation();
  const submit = api.royalty.submit.useMutation();
  const resume = api.royalty.resume.useMutation();
  const cancel = api.royalty.cancel.useMutation();

  const [step, setStep] = useState<TransactionStep | null>(null);
  const pending = useRef<Started | null>(null);
  const sent = useRef(0);

  const busy =
    step !== null &&
    (step.kind === "countdown" || step.kind === "confirm" || step.kind === "submitting");

  const refresh = () =>
    Promise.all([
      utils.royalty.history.invalidate(),
      utils.royalty.quote.invalidate(),
      utils.royalty.items.invalidate(),
      utils.account.me.invalidate(),
      utils.admin.activity.list.invalidate(),
    ]);

  async function begin(started: Started, summary: ReactNode) {
    pending.current = started;
    sent.current = 0;
    if (started.batches.length === 0) {
      setStep({ kind: "success", title: "Everyone was paid", body: "Nothing was left to send." });
      pending.current = null;
      await refresh();
      return;
    }
    if (started.signer === "custodial") {
      setStep({ kind: "countdown", summary, seconds: CUSTODIAL_COUNTDOWN_SECONDS });
      return;
    }
    await sendAll(summary);
  }

  /** Every batch in order; each one waits for its approval. */
  async function sendAll(summary: ReactNode) {
    const job = pending.current;
    if (!job) return;
    const user = session.data?.user;
    const walletName = getWalletProvider(user?.walletType ?? "")?.label ?? "your wallet";
    try {
      for (const batch of job.batches) {
        let xdr = batch.xdr;
        const parts = job.batches.at(-1)?.batchNo ?? 1;
        // Only payouts to more than 100 fans are split; the artist sees parts only then.
        const label = parts > 1 ? ` · part ${batch.batchNo} of ${parts}` : "";
        if (job.signer === "wallet") {
          setStep({
            kind: "confirm",
            summary: (
              <>
                {summary}
                {label}
              </>
            ),
            walletName,
          });
          xdr = await signTransaction({
            xdr,
            publicKey: user?.walletAddress ?? "",
            walletType: user?.walletType ?? "",
          }).catch(() => {
            throw new Declined();
          });
          // Canceled while the wallet was open: the late signature is thrown away.
          if (pending.current?.payoutId !== job.payoutId) return;
        }
        setStep({ kind: "submitting", summary: `Sending${label}…` });
        await submit.mutateAsync({ payoutId: job.payoutId, batchNo: batch.batchNo, xdr });
        sent.current += 1;
      }
      setStep({
        kind: "success",
        title: "Fans paid",
        body: "Each fan's share is in their wallet.",
      });
      pending.current = null;
      await refresh();
      onDone();
    } catch (error) {
      pending.current = null;
      // A declined wallet popup before anything went out just drops the payout.
      if (error instanceof Declined && sent.current === 0) {
        setStep({ kind: "canceled" });
        await cancel.mutateAsync({ payoutId: job.payoutId }).catch(() => undefined);
      } else {
        const some = sent.current > 0;
        setStep({
          kind: "failed",
          reason: `${error instanceof Declined ? "The wallet didn't sign." : reasonOf(error)}${some ? " Some fans were paid; press Finish paying on the payout to pay the rest." : ""}`,
        });
      }
      await refresh();
    }
  }

  async function run(input: PayoutInput, summary: ReactNode) {
    try {
      setStep({
        kind: "submitting",
        title: "Getting ready…",
        summary: "Working out each fan's share.",
      });
      await begin(await start.mutateAsync(input), summary);
    } catch (error) {
      setStep({ kind: "failed", reason: reasonOf(error) });
    }
  }

  async function resumePayout(payoutId: string) {
    try {
      setStep({
        kind: "submitting",
        title: "Checking…",
        summary: "Finding who is already paid.",
      });
      await begin(await resume.mutateAsync({ payoutId }), "Pay the rest");
    } catch (error) {
      setStep({ kind: "failed", reason: reasonOf(error) });
    }
  }

  /** The countdown ran out (or "Send now"). */
  function send() {
    void sendAll("Paying holders");
  }

  /** Cancel in the countdown. */
  async function stop() {
    const job = pending.current;
    pending.current = null;
    setStep({ kind: "canceled" });
    if (job && sent.current === 0)
      await cancel.mutateAsync({ payoutId: job.payoutId }).catch(() => undefined);
    await refresh();
  }

  return { step, busy, run, resumePayout, send, stop, close: () => setStep(null) };
}
