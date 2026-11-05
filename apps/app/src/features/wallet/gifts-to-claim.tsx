"use client";

import { Gift, Loader2 } from "lucide-react";
import { useSession } from "next-auth/react";
import { useRef, useState } from "react";

import { isAppError } from "@bandcoin/errors";
import { Button } from "@bandcoin/ui/components/button";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import {
  CUSTODIAL_COUNTDOWN_SECONDS,
  ToastViewport,
  TransactionToast,
  type TransactionStep,
} from "@bandcoin/ui/patterns/transaction-toast";
import { WalletPanel } from "@bandcoin/ui/patterns/wallet-blocks";
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
 * Pending gifts: tokens waiting for the fan to accept, from an artist (their
 * fan token, sent before the fan held it) or from anyone who sent a token the
 * fan couldn't hold yet. Each shows what accepting costs first; accepting
 * moves through the usual toast: countdown with Cancel for email/Google/Apple
 * accounts, "Confirm in your wallet" for wallet extensions.
 */
export function GiftsToClaim() {
  const gifts = api.wallet.gifts.useQuery();
  const flow = useGiftClaim();
  const count = gifts.data?.length ?? 0;

  return (
    <WalletPanel
      title={
        <>
          Pending gifts
          {count > 0 && (
            <span className="bg-primary text-primary-foreground rounded-full px-2 font-sans text-sm font-bold tabular-nums">
              {count}
            </span>
          )}
        </>
      }
    >
      {gifts.isPending ? (
        <Skeleton className="h-14 rounded-xl" />
      ) : count === 0 ? (
        <p className="text-fg-muted flex items-center gap-2 py-2 text-sm">
          <Gift className="size-4" /> No gifts waiting. Tokens sent to you show up here to accept.
        </p>
      ) : (
        <ul className="space-y-2">
          {gifts.data!.map((gift) => (
            <li
              key={gift.balanceId}
              className="bg-surface-2 flex items-center gap-3 rounded-xl p-3"
            >
              <span className="blob bg-primary text-primary-foreground flex size-10 shrink-0 -rotate-6 items-center justify-center">
                <Gift className="size-5" strokeWidth={2.4} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  <span className="num">{tokens(gift.amount)}</span> {gift.code}
                  {gift.title !== gift.code && (
                    <span className="text-fg-muted font-normal"> · {gift.title}</span>
                  )}
                </p>
                <p className="text-fg-muted truncate text-xs">
                  From {senderOf(gift)} · accepting costs{" "}
                  <Money amount={gift.cost.total} currency="XLM" />
                </p>
              </div>
              <Button size="sm" disabled={flow.busy} onClick={() => flow.claim(gift)}>
                {flow.busy && flow.current === gift.balanceId && (
                  <Loader2 className="size-4 animate-spin" />
                )}
                Accept
              </Button>
            </li>
          ))}
        </ul>
      )}
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
    </WalletPanel>
  );
}

/** The artist, the Bandcoin user, or the start and end of the address. */
function senderOf(gift: WaitingGift) {
  if (gift.artist) return gift.artist.name;
  if (gift.from.username) return `@${gift.from.username}`;
  return gift.from.address
    ? `${gift.from.address.slice(0, 5)}…${gift.from.address.slice(-5)}`
    : "someone";
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
      setStep({ kind: "success", title: "Gift accepted", body: "It's in your wallet now." });
      await Promise.all([
        utils.wallet.gifts.invalidate(),
        utils.wallet.assets.invalidate(),
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
    current,
    claim: (gift: WaitingGift) => void claim(gift),
    send: () => void send(),
    stop,
    close: () => setStep(null),
  };
}
