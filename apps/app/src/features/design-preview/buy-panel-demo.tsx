"use client";

import { useState } from "react";

import { Badge } from "@actiontokens/ui/components/badge";
import { Button } from "@actiontokens/ui/components/button";
import { cn } from "@actiontokens/ui/lib/cn";
import { PriceBreakdown, ShortfallNotice } from "@actiontokens/ui/patterns/price-breakdown";
import { QuantityStepper } from "@actiontokens/ui/patterns/quantity-stepper";
import {
  CUSTODIAL_COUNTDOWN_SECONDS,
  ToastViewport,
  TransactionToast,
  type TransactionStep,
} from "@actiontokens/ui/patterns/transaction-toast";

/*
 * Preview only: sample prices and balances, math in the browser. The real buy
 * panel shows a server quote (see docs/plans/04-transactions.md).
 */
type Currency = "ACTION" | "XLM" | "USDC";
const PRICES: Record<Currency, { unit: number; dp: number }> = {
  ACTION: { unit: 25000, dp: 0 },
  XLM: { unit: 4.2, dp: 2 },
  USDC: { unit: 1.1, dp: 2 },
};
const START_BALANCES: Record<Currency, number> = { ACTION: 60000, XLM: 9.8, USDC: 1.5 };
const FEE_BPS = 250;
const TRUSTLINE_XLM = 0.5;
const NETWORK_XLM = 0.00001;
const MAX_QTY = 10;

const fmt = (n: number, dp: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: Math.max(dp, 5) });

type Wallet = "custodial" | "freighter";

export function BuyPanelDemo() {
  const [currency, setCurrency] = useState<Currency>("ACTION");
  const [qty, setQty] = useState(1);
  const [wallet, setWallet] = useState<Wallet>("custodial");
  const [balances, setBalances] = useState(START_BALANCES);
  const [step, setStep] = useState<TransactionStep | null>(null);

  const { unit, dp } = PRICES[currency];
  const subtotal = unit * qty;
  const fee = (subtotal * FEE_BPS) / 10000;
  const xlmExtra = TRUSTLINE_XLM + NETWORK_XLM;
  const payInCurrency = subtotal + fee + (currency === "XLM" ? xlmExtra : 0);
  const shortBy = Math.max(0, payInCurrency - balances[currency]);
  const isShort = shortBy > 0 || (currency !== "XLM" && balances.XLM < xlmExtra);
  const busy = step !== null && ["countdown", "confirm", "submitting"].includes(step.kind);
  const summary = `${fmt(payInCurrency, dp)} ${currency} for ${qty} × Night Drive`;

  const submit = () => {
    setStep({ kind: "submitting", summary });
    setTimeout(() => {
      setBalances((b) => ({
        ...b,
        [currency]: b[currency] - payInCurrency,
        ...(currency !== "XLM" ? { XLM: b.XLM - xlmExtra } : {}),
      }));
      setStep({
        kind: "success",
        title: `Done. You own ${qty} × Night Drive`,
        body: "It's in your collection and plays in full now.",
      });
    }, 1600);
  };

  const pay = () => {
    if (isShort || busy) return;
    setStep(
      wallet === "custodial"
        ? { kind: "countdown", summary, seconds: CUSTODIAL_COUNTDOWN_SECONDS }
        : { kind: "confirm", summary, walletName: "Freighter" },
    );
  };

  const close = () => setStep(null);
  const smallBtn = "h-8 px-3 text-[13px]";

  return (
    <aside
      aria-label="Buy"
      className="bg-surface shadow-raised grid gap-5 rounded-xl border p-5 lg:sticky lg:top-4"
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="num text-[30px] leading-none font-semibold tracking-tight">
          {fmt(unit, dp)}
          <small className="text-fg-muted ml-1.5 text-sm">{currency}</small>
        </div>
        <Badge>per copy</Badge>
      </div>

      <div className="grid gap-1.5">
        <span className="eyebrow">Pay with</span>
        <div role="group" aria-label="Currency" className="grid grid-cols-3 gap-2">
          {(Object.keys(PRICES) as Currency[]).map((c) => (
            <button
              key={c}
              type="button"
              disabled={busy}
              aria-pressed={c === currency}
              onClick={() => setCurrency(c)}
              className={cn(
                "bg-surface-2 grid min-w-0 gap-0.5 rounded-md border p-2.5 text-left transition-colors",
                c === currency && "border-primary-text bg-primary-soft",
              )}
            >
              <b className="text-[13px]">{c}</b>
              <span className="num text-fg-muted truncate text-[11px]">
                bal {fmt(balances[c], PRICES[c].dp)}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div>
          <b className="text-sm">Quantity</b>
          <p className="text-fg-faint text-xs">Max {MAX_QTY} per order</p>
        </div>
        <QuantityStepper value={qty} onChange={setQty} max={MAX_QTY} disabled={busy} />
      </div>

      <PriceBreakdown
        lines={[
          {
            label: "Item price",
            detail: `${qty} × ${fmt(unit, dp)} ${currency}`,
            value: `${fmt(subtotal, dp)} ${currency}`,
          },
          { label: "Platform fee", detail: "2.5 %", value: `${fmt(fee, dp)} ${currency}` },
          { label: "Trustline", detail: "first time only, refundable reserve", value: "0.50 XLM" },
          { label: "Network fee", value: "0.00001 XLM" },
        ]}
        total={
          currency === "XLM" ? (
            `${fmt(payInCurrency, dp)} XLM`
          ) : (
            <>
              {fmt(subtotal + fee, dp)} {currency}
              <br />+ {fmt(xlmExtra, 2)} XLM
            </>
          )
        }
        balance={{
          value: `${fmt(balances[currency], dp)} ${currency}`,
          shortBy: shortBy > 0 ? `${fmt(shortBy, dp)} ${currency}` : undefined,
        }}
      />
      {shortBy > 0 && (
        <ShortfallNotice currency={currency} shortBy={`${fmt(shortBy, dp)} ${currency}`} />
      )}

      <Button size="lg" variant={isShort ? "secondary" : "default"} disabled={busy} onClick={pay}>
        {busy
          ? "Waiting for you"
          : isShort
            ? "Add funds"
            : `Pay ${fmt(payInCurrency, dp)} ${currency}`}
      </Button>

      <div className="text-fg-muted flex flex-wrap items-center justify-between gap-2 text-[13px]">
        <span>Signed with</span>
        <div
          role="group"
          aria-label="Wallet type"
          className="bg-surface inline-flex gap-0.5 rounded-full border p-[3px]"
        >
          {(
            [
              ["custodial", "Email account"],
              ["freighter", "Freighter"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              disabled={busy}
              aria-pressed={wallet === value}
              onClick={() => setWallet(value)}
              className={cn(
                "rounded-full px-3 py-1.5 font-semibold",
                wallet === value && "bg-surface-3 text-fg",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {step && (
        <ToastViewport>
          <TransactionToast
            key={step.kind}
            step={step}
            onSend={submit}
            onCancel={() => setStep({ kind: "canceled" })}
            actions={
              step.kind === "confirm" ? (
                <>
                  <Button size="sm" variant="secondary" className={smallBtn} onClick={submit}>
                    Simulate approve
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className={smallBtn}
                    onClick={() => setStep({ kind: "canceled" })}
                  >
                    Simulate reject
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="secondary" className={smallBtn} onClick={close}>
                  Close
                </Button>
              )
            }
          />
        </ToastViewport>
      )}
    </aside>
  );
}
