"use client";

import { ArrowDownToLine, Check, Copy, CreditCard } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import QRCode from "react-qr-code";

import { isAppError } from "@actiontokens/errors";
import { Button } from "@actiontokens/ui/components/button";
import { cn } from "@actiontokens/ui/lib/cn";
import {
  type TransactionStep,
  ToastViewport,
  TransactionToast,
} from "@actiontokens/ui/patterns/transaction-toast";

import { Money } from "~/components/money";
import { api } from "~/trpc/react";

import { useSquareCard } from "../buy/square-card";
import { QuoteBreakdown } from "./quote-breakdown";

/** About what a wallet needs to exist (1 XLM) plus room for a trustline and fees. */
const SEND_AT_LEAST_XLM = "2";

/**
 * A new wallet isn't on the Stellar network until it holds XLM, so nothing can
 * be paid or recharged yet. Two ways in: pay a small card price and Bandcoin
 * creates the wallet with that XLM, or send XLM from somewhere else. The page
 * checks every few seconds and moves on once the wallet is live.
 */
export function ActivateWallet({ address }: { address: string }) {
  const utils = api.useUtils();
  const quote = api.activation.quote.useQuery(undefined, {
    refetchInterval: 30_000,
    placeholderData: (previous) => previous,
  });
  const start = api.activation.start.useMutation();
  const submit = api.activation.submit.useMutation();
  const { container: cardField, ...card } = useSquareCard(true);
  const [step, setStep] = useState<TransactionStep | null>(null);
  const busy = step?.kind === "submitting";

  // Watching for XLM sent from elsewhere (and for our own card payment landing).
  useEffect(() => {
    const timer = setInterval(() => void utils.account.me.invalidate(), 10_000);
    return () => clearInterval(timer);
  }, [utils]);

  async function pay() {
    const cardToken = await card.tokenize();
    if (!cardToken) return;
    try {
      setStep({
        kind: "submitting",
        title: "Activating your wallet…",
        summary: "Charging your card and creating your wallet. This takes a few seconds.",
      });
      const started = await start.mutateAsync();
      await submit.mutateAsync({ orderId: started.orderId, card: cardToken });
      setStep({
        kind: "success",
        title: "Your wallet is active.",
        body: "It starts with the XLM shown in the price. You can recharge now.",
      });
      await Promise.all([utils.account.me.invalidate(), utils.activation.quote.invalidate()]);
    } catch (error) {
      setStep({
        kind: "failed",
        reason:
          isAppError(error) || error instanceof Error
            ? error.message
            : "Something went wrong. Your card wasn't charged.",
      });
    }
  }

  const data = quote.data;
  const charge = data?.lines.find((line) => line.key === "charge");
  return (
    <section aria-label="Activate your wallet" className="grid gap-5">
      <div>
        <h2 className="text-lg font-semibold">Activate your wallet</h2>
        <p className="text-fg-muted text-sm">
          Your wallet needs its first XLM before it can pay, recharge or hold anything. Pick
          whichever is easier.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="bg-surface grid content-start gap-4 rounded-2xl border p-5">
          <h3 className="flex items-center gap-2 font-semibold">
            <CreditCard className="size-4" /> Pay by card
          </h3>
          <p className="text-fg-muted text-sm">
            We create your wallet and fund it with the XLM this price buys. Nothing else is bought.
          </p>
          <QuoteBreakdown
            lines={(data?.lines ?? []).filter((line) => line.key !== "charge")}
            pay={charge ? { currency: "USD", amount: charge.amount } : null}
            problems={data?.problems ?? []}
            loading={quote.isPending}
            error={quote.error?.message}
          />
          {data?.ok && charge && (
            <>
              <div
                ref={cardField}
                className={cn(
                  "min-h-[90px]",
                  card.loading && "bg-surface-2 animate-pulse rounded-md",
                )}
              />
              {card.error && <p className="text-danger text-xs">{card.error}</p>}
              <Button size="lg" disabled={busy || !card.ready} onClick={() => void pay()}>
                Pay <Money amount={charge.amount} currency="USD" /> and activate
              </Button>
            </>
          )}
        </div>

        <SendXlm address={address} />
      </div>

      {step && (
        <ToastViewport>
          <TransactionToast
            key={step.kind}
            step={step}
            onSend={() => undefined}
            onCancel={() => undefined}
            actions={
              step.kind === "success" ? (
                <Button asChild size="sm" variant="secondary" className="h-8 px-3 text-[13px]">
                  <Link href="/recharge">Recharge</Link>
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-8 px-3 text-[13px]"
                  onClick={() => setStep(null)}
                >
                  Close
                </Button>
              )
            }
          />
        </ToastViewport>
      )}
    </section>
  );
}

function SendXlm({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="bg-surface grid content-start gap-4 rounded-2xl border p-5">
      <h3 className="flex items-center gap-2 font-semibold">
        <ArrowDownToLine className="size-4" /> Send XLM yourself
      </h3>
      <p className="text-fg-muted text-sm">
        Send at least {SEND_AT_LEAST_XLM} XLM to this address from a wallet or an exchange. This
        page activates by itself when it arrives.
      </p>
      <div className="justify-self-center rounded-xl bg-white p-3">
        <QRCode value={address} size={150} />
      </div>
      <code className="bg-surface-2 rounded-md p-3 font-mono text-xs break-all">{address}</code>
      <Button
        variant="secondary"
        onClick={() =>
          void navigator.clipboard.writeText(address).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          })
        }
      >
        {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy address"}
      </Button>
    </div>
  );
}
