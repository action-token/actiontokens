"use client";

import { Gift, Loader2 } from "lucide-react";
import { useSession } from "next-auth/react";
import { useRef, useState } from "react";

import { isAppError } from "@bandcoin/errors";
import { Button } from "@bandcoin/ui/components/button";
import {
  CUSTODIAL_COUNTDOWN_SECONDS,
  ToastViewport,
  TransactionToast,
  type TransactionStep,
} from "@bandcoin/ui/patterns/transaction-toast";
import { getWalletProvider, signTransaction } from "@bandcoin/wallet";

import { Money } from "~/components/money";
import { api, type RouterOutputs } from "~/trpc/react";

type WaitingGift = RouterOutputs["wallet"]["gifts"][number];

const reasonOf = (error: unknown) =>
  isAppError(error) || error instanceof Error
    ? error.message
    : "Couldn't claim the gift. Nothing was sent.";

const tokens = (amount: string) =>
  Number(amount).toLocaleString("en-US", { maximumFractionDigits: 7 });

/**
 * Gifts an artist left for the fan to claim (their fan token, sent before the
 * fan held it). Each shows what claiming costs first; claiming moves through
 * the usual toast: countdown with Cancel for email/Google/Apple accounts,
 * "Confirm in your wallet" for wallet extensions.
 */
export function GiftsToClaim() {
  const gifts = api.wallet.gifts.useQuery();
  const flow = useGiftClaim();
  if (!gifts.data?.length) return null;

  return (
    <section className="grid gap-3">
      <h2 className="display flex items-center gap-2 text-lg">
        <Gift className="text-primary-text size-5" /> Gifts to claim
      </h2>
      <ul className="divide-y rounded-2xl border">
        {gifts.data.map((gift) => (
          <li key={gift.balanceId} className="flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                <span className="num">{tokens(gift.amount)}</span> {gift.code}
              </p>
              <p className="text-fg-muted text-sm">
                From {gift.artist?.name ?? "an artist"} · {gift.title}
              </p>
              <p className="text-fg-muted text-xs">
                Claiming costs <Money amount={gift.cost.total} currency="XLM" />
                {gift.cost.lines.some((line) => line.key === "reserve") &&
                  " (most of it stays in your wallet so it can hold the token)"}
              </p>
            </div>
            <Button disabled={flow.busy} onClick={() => flow.claim(gift)}>
              {flow.busy && flow.current === gift.balanceId && (
                <Loader2 className="size-4 animate-spin" />
              )}
              Claim
            </Button>
          </li>
        ))}
      </ul>
      {flow.step && (
        <ToastViewport>
          <TransactionToast
            key={flow.step.kind}
            step={flow.step}
            onSend={flow.send}
            onCancel={flow.stop}
            actions={
              <Button
                size="sm"
                variant={flow.step.kind === "confirm" ? "secondary" : "ghost"}
                className="h-8 px-3 text-[13px]"
                onClick={flow.step.kind === "confirm" ? flow.stop : flow.close}
              >
                {flow.step.kind === "confirm" ? "Cancel" : "Close"}
              </Button>
            }
          />
        </ToastViewport>
      )}
    </section>
  );
}

function useGiftClaim() {
  const session = useSession();
  const utils = api.useUtils();
  const prepare = api.wallet.prepareGiftClaim.useMutation();
  const submit = api.wallet.submitGiftClaim.useMutation();
  const [step, setStep] = useState<TransactionStep | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const pending = useRef<string | null>(null);

  const busy =
    step !== null &&
    (step.kind === "countdown" || step.kind === "confirm" || step.kind === "submitting");

  async function claim(gift: WaitingGift) {
    setCurrent(gift.balanceId);
    const summary = (
      <>
        Claim {tokens(gift.amount)} {gift.code}. You pay{" "}
        <Money amount={gift.cost.total} currency="XLM" />.
      </>
    );
    let prepared;
    try {
      setStep({ kind: "submitting", title: "Preparing your claim…", summary });
      prepared = await prepare.mutateAsync({ balanceId: gift.balanceId });
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
    if (!xdr || !current) return;
    setStep({ kind: "submitting", summary: "Claiming your gift. This takes a few seconds." });
    try {
      await submit.mutateAsync({ balanceId: current, xdr });
      setStep({ kind: "success", title: "Gift claimed", body: "It's in your wallet now." });
      await Promise.all([utils.wallet.gifts.invalidate(), utils.account.me.invalidate()]);
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
    current,
    claim: (gift: WaitingGift) => void claim(gift),
    send: () => void send(),
    stop,
    close: () => setStep(null),
  };
}
