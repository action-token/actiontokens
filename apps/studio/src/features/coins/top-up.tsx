"use client";

import { CircleAlert, CreditCard, Loader2, Wallet } from "lucide-react";
import { useSession } from "next-auth/react";
import { useState } from "react";
import toast from "react-hot-toast";

import { AppError, ErrorCodes } from "@bandcoin/errors";
import { Button } from "@bandcoin/ui/components/button";
import { Input } from "@bandcoin/ui/components/input";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { cn } from "@bandcoin/ui/lib/cn";

import { Money } from "~/components/money";
import { api, type RouterInputs } from "~/trpc/react";

import { PaymentToast } from "../payments/payment-toast";
import { useSquareCard } from "../payments/square-card";
import { useWalletPayment } from "../payments/use-wallet-payment";
import { topUpChoice, type Choice } from "./choice";

type Currency = RouterInputs["coins"]["quote"]["currency"];
const PAY_WITH: { value: Currency; label: string }[] = [
  { value: "USD", label: "Card" },
  { value: "BANDCOIN", label: "BANDCOIN" },
  { value: "XLM", label: "XLM" },
  { value: "USDC", label: "USDC" },
];

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong.";

/**
 * Buy coins: a package (with its bonus) or any amount from $1 to $500, paid by
 * card or from your wallet. The server prices it live; nothing is charged or
 * signed until the Pay button.
 */
export function TopUp() {
  const { status } = useSession();
  const utils = api.useUtils();
  const packages = api.coins.packages.useQuery();
  const [choice, setChoice] = useState<Choice>({ kind: "package", packageId: null });
  const [amount, setAmount] = useState("5");
  const [currency, setCurrency] = useState<Currency>("USD");
  const firstPackage = packages.data?.find((pack) => pack.isPopular) ?? packages.data?.[0];
  const picked = topUpChoice(choice, amount, firstPackage?.id ?? null);
  const input = picked.ok ? { currency, ...picked.input } : null;

  const quote = api.coins.quote.useQuery(input!, {
    enabled: status === "authenticated" && input !== null,
    refetchInterval: 30_000,
    placeholderData: (previous) => previous,
  });
  const start = api.coins.start.useMutation();
  const submit = api.coins.submit.useMutation();
  const cancel = api.coins.cancel.useMutation();
  const card = useSquareCard(currency === "USD");
  const { container: cardBox, ready: cardReady, loading: cardLoading, error: cardError } = card;
  const [paying, setPaying] = useState(false);

  const refresh = () =>
    Promise.all([utils.coins.balance.invalidate(), utils.coins.ledger.invalidate()]);
  const wallet = useWalletPayment({
    start: async () => {
      const started = await start.mutateAsync(input!);
      if (!started.xdr)
        throw new AppError(ErrorCodes.INTERNAL, { message: "This payment has nothing to sign." });
      return { orderId: started.orderId, xdr: started.xdr, signer: started.signer };
    },
    submit: (payload) => submit.mutateAsync(payload),
    cancel: (payload) => cancel.mutateAsync(payload),
    preparing: "Preparing your payment…",
    sending: "Paying. This takes a few seconds.",
    success: { title: "Coins added", body: "Your coins are ready to use in Studio." },
    onDone: refresh,
  });

  async function payByCard() {
    if (!input) return;
    setPaying(true);
    try {
      const token = await card.tokenize();
      if (!token) return;
      const started = await start.mutateAsync(input);
      const done = await submit.mutateAsync({ orderId: started.orderId, card: token });
      toast.success(`${done.coins.toLocaleString("en-US")} coins added`);
      await refresh();
    } catch (error) {
      toast.error(messageOf(error));
    } finally {
      setPaying(false);
    }
  }

  const data = quote.data;
  const busy = paying || wallet.busy;
  const problems = data?.problems ?? [];

  return (
    <section className="bg-surface grid gap-5 rounded-[1.4rem] border-2 p-5 sm:p-6">
      <h2 className="display text-xl">Top up</h2>

      <div
        role="radiogroup"
        aria-label="How many coins"
        className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
      >
        {packages.isPending
          ? [0, 1, 2].map((key) => <Skeleton key={key} className="h-24 rounded-xl" />)
          : packages.data?.map((pack) => {
              const on =
                choice.kind === "package" && (choice.packageId ?? firstPackage?.id) === pack.id;
              return (
                <button
                  key={pack.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={busy}
                  onClick={() => setChoice({ kind: "package", packageId: pack.id })}
                  className={cn(
                    "relative grid gap-1 rounded-xl border-2 p-4 text-left transition-colors",
                    on ? "border-primary bg-primary-soft" : "hover:bg-surface-2",
                  )}
                >
                  {pack.isPopular && (
                    <span className="bg-primary text-primary-foreground absolute -top-2.5 right-3 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase">
                      Popular
                    </span>
                  )}
                  <span className="text-sm font-semibold">{pack.name}</span>
                  <span className="display text-2xl tabular-nums">
                    {(pack.coins + pack.bonusCoins).toLocaleString("en-US")}
                  </span>
                  <span className="text-fg-muted text-xs">
                    ${pack.priceUsd.toFixed(2)}
                    {pack.bonusCoins > 0
                      ? ` · includes ${pack.bonusCoins.toLocaleString("en-US")} bonus`
                      : ""}
                  </span>
                </button>
              );
            })}
        <div
          role="radio"
          aria-checked={choice.kind === "amount"}
          tabIndex={0}
          onClick={() => !busy && setChoice({ kind: "amount" })}
          onKeyDown={(event) => event.key === "Enter" && !busy && setChoice({ kind: "amount" })}
          className={cn(
            "grid cursor-pointer gap-1 rounded-xl border-2 p-4 transition-colors",
            choice.kind === "amount" ? "border-primary bg-primary-soft" : "hover:bg-surface-2",
          )}
        >
          <span className="text-sm font-semibold">Any amount</span>
          <label className="flex items-center gap-1">
            <span className="display text-xl">$</span>
            <Input
              aria-label="Amount in dollars"
              inputMode="decimal"
              value={amount}
              disabled={busy}
              onFocus={() => setChoice({ kind: "amount" })}
              onChange={(event) => setAmount(event.target.value.replace(/[^\d.]/g, "").slice(0, 6))}
              className="h-9 w-24"
            />
          </label>
          <span className="text-fg-muted text-xs">
            {picked.ok && choice.kind === "amount"
              ? `${Math.round(Number(amount) * 100).toLocaleString("en-US")} coins`
              : "$1 to $500"}
          </span>
        </div>
      </div>
      {!picked.ok && <p className="text-danger text-sm">{picked.problem}</p>}

      <div role="radiogroup" aria-label="Pay with" className="flex flex-wrap gap-2">
        {PAY_WITH.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={currency === option.value}
            disabled={busy}
            onClick={() => setCurrency(option.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border-2 px-3.5 py-1.5 text-sm font-medium transition-colors",
              currency === option.value ? "border-primary bg-primary-soft" : "hover:bg-surface-2",
            )}
          >
            {option.value === "USD" ? (
              <CreditCard className="size-4" />
            ) : (
              <Wallet className="size-4" />
            )}
            {option.label}
          </button>
        ))}
      </div>

      {status === "authenticated" && input && (
        <div className="grid gap-2 border-t pt-4 text-sm">
          {!data ? (
            <Skeleton className="h-12 w-full" />
          ) : (
            <>
              <p className="flex justify-between gap-3">
                <span className="text-fg-muted">You get</span>
                <b className="tabular-nums">
                  {(data.coins + data.bonusCoins).toLocaleString("en-US")} coins
                  {data.bonusCoins > 0 ? ` (${data.bonusCoins.toLocaleString("en-US")} bonus)` : ""}
                </b>
              </p>
              <p className="flex justify-between gap-3">
                <span className="text-fg-muted">You pay</span>
                <b>
                  <Money amount={data.pay} currency={data.currency} />
                </b>
              </p>
              {data.networkFeeXlm && (
                <p className="text-fg-faint flex justify-between gap-3 text-xs">
                  <span>Network fee</span>
                  <Money amount={data.networkFeeXlm} currency="XLM" />
                </p>
              )}
              {problems.map((problem) => (
                <p
                  key={problem.message}
                  role="alert"
                  className="bg-surface-2 text-fg-muted flex gap-2 rounded-md p-3 text-[13px]"
                >
                  <CircleAlert className="text-warning mt-px size-4 shrink-0" />
                  {problem.message}
                </p>
              ))}
            </>
          )}
        </div>
      )}

      {currency === "USD" && (
        <div className="grid gap-1.5">
          <div ref={cardBox} className="min-h-[92px]" />
          {cardLoading && <Skeleton className="h-12 w-full" />}
          {cardError && <p className="text-danger text-xs">{cardError}</p>}
        </div>
      )}

      <Button
        className="justify-self-start"
        disabled={
          status !== "authenticated" || !data?.ok || busy || (currency === "USD" && !cardReady)
        }
        onClick={() =>
          currency === "USD"
            ? void payByCard()
            : void wallet.run(data ? <Money amount={data.pay} currency={data.currency} /> : null)
        }
      >
        {busy && <Loader2 className="animate-spin" />}
        {busy ? (
          "Working…"
        ) : data ? (
          <>
            Pay <Money amount={data.pay} currency={data.currency} />
          </>
        ) : (
          "Pay"
        )}
      </Button>
      <PaymentToast flow={wallet} />
    </section>
  );
}
