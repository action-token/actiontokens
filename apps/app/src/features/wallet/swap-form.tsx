"use client";

import { ArrowDownUp } from "lucide-react";
import { useDeferredValue, useState } from "react";

import { Button } from "@bandcoin/ui/components/button";
import { Input } from "@bandcoin/ui/components/input";
import { cn } from "@bandcoin/ui/lib/cn";

import { Money } from "~/components/money";
import { api } from "~/trpc/react";

import { QuoteBreakdown } from "../recharge/quote-breakdown";
import type { WalletOrderFlow } from "./use-wallet-order";

type Direction = "TO_XLM" | "TO_BANDCOIN";
const PAYS = { TO_XLM: "BANDCOIN", TO_BANDCOIN: "XLM" } as const;
const GETS = { TO_XLM: "XLM", TO_BANDCOIN: "BANDCOIN" } as const;
const AMOUNT = /^\d{0,12}(\.\d{0,7})?$/;

/**
 * Swap any amount of BANDCOIN for XLM, or XLM for BANDCOIN, with the platform
 * at today's price (less the 2% cushion). The server's quote shows exactly
 * what goes and what arrives before anything is signed. Used in the Wallet's
 * Swap dialog and on the Recharge page.
 */
export function SwapForm({
  flow,
  initial = "TO_XLM",
  onStarted,
}: {
  flow: WalletOrderFlow;
  initial?: Direction;
  /** The toast takes over: a dialog closes here */
  onStarted?: () => void;
}) {
  const [direction, setDirection] = useState<Direction>(initial);
  const [amount, setAmount] = useState("");
  const assets = api.wallet.assets.useQuery();
  const ready = Number(amount) > 0;
  const input = useDeferredValue({ direction, amount });
  const quote = api.wallet.swap.quote.useQuery(input, {
    // the deferred copy is what's sent, so it decides
    enabled: Number(input.amount) > 0,
    refetchInterval: 30_000,
    placeholderData: (previous) => previous,
  });
  const q = ready ? quote.data : undefined;
  const pays = PAYS[direction];
  const have = assets.data?.tokens.find((token) => token.kind === pays.toLowerCase())?.amount;

  async function swap() {
    if (!q?.ok) return;
    onStarted?.();
    await flow.run({
      kind: "swap",
      input: { direction, amount },
      summary: (
        <>
          <Money amount={q.pay.amount} currency={q.pay.currency} /> for{" "}
          <Money amount={q.receive.amount} currency={q.receive.currency} />
        </>
      ),
      success: {
        title: `Swapped. Your ${q.receive.currency} is in your wallet.`,
        body: "It can take a few seconds to show in your balance.",
      },
    });
  }

  return (
    <div className="grid gap-4">
      <div
        role="radiogroup"
        aria-label="Swap"
        className="bg-surface-2 grid grid-cols-2 gap-1 rounded-xl p-1"
      >
        {(["TO_XLM", "TO_BANDCOIN"] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={direction === option}
            onClick={() => setDirection(option)}
            className={cn(
              "rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
              direction === option ? "bg-fg text-bg" : "text-fg-muted hover:text-fg",
            )}
          >
            {PAYS[option]} → {GETS[option]}
          </button>
        ))}
      </div>

      <label className="grid gap-1.5">
        <span className="flex items-center justify-between text-sm font-medium">
          You pay in {pays}
          {have && (
            <span className="text-fg-muted text-xs font-normal">
              You have <Money amount={have} currency={pays} />
            </span>
          )}
        </span>
        <span className="flex gap-2">
          <Input
            inputMode="decimal"
            value={amount}
            placeholder="0"
            aria-label={`Amount of ${pays}`}
            onChange={(event) => {
              const next = event.target.value.replace(/,/g, "");
              if (AMOUNT.test(next)) setAmount(next);
            }}
            className="display h-12 text-3xl"
          />
          <Button
            type="button"
            variant="outline"
            className="h-12"
            disabled={!have || Number(have) <= 0}
            onClick={() => have && setAmount(String(Number(have)))}
          >
            Max
          </Button>
        </span>
      </label>

      <div className="bg-surface-2 flex items-center justify-between gap-3 rounded-xl px-4 py-3">
        <span className="text-fg-muted flex items-center gap-2 text-sm">
          <ArrowDownUp className="size-4" /> You receive
        </span>
        <span className="display text-3xl">
          {q && q.receive.amount !== "0" ? (
            <Money amount={q.receive.amount} currency={q.receive.currency} className="display" />
          ) : (
            "—"
          )}
        </span>
      </div>

      {ready && (
        <QuoteBreakdown
          lines={(q?.lines ?? []).filter((line) => line.key !== "pay" && line.key !== "receive")}
          pay={q && q.pay.amount !== "0" ? q.pay : null}
          problems={q?.problems ?? []}
          loading={quote.isPending}
          error={quote.error?.message}
        />
      )}

      <Button
        size="lg"
        disabled={!q?.ok || flow.busy || quote.isFetching}
        onClick={() => void swap()}
      >
        {q && !q.ok ? "Can't swap this" : `Swap to ${GETS[direction]}`}
      </Button>
    </div>
  );
}
