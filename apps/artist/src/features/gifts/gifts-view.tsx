"use client";

import { Gift, Search, Send, Users, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@bandcoin/ui/components/button";
import { Input } from "@bandcoin/ui/components/input";
import { Label } from "@bandcoin/ui/components/label";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { cn } from "@bandcoin/ui/lib/cn";
import { EmptyState } from "@bandcoin/ui/patterns/empty-state";
import { ErrorState } from "@bandcoin/ui/patterns/error-state";
import { PageBody, PageHeader } from "@bandcoin/ui/patterns/page-header";
import { Avatar } from "@bandcoin/ui/patterns/person";
import { ToastViewport, TransactionToast } from "@bandcoin/ui/patterns/transaction-toast";

import { Money } from "~/components/money";
import { timeAgo } from "~/lib/format";
import { api } from "~/trpc/react";

import { QuoteBreakdown } from "../payments/quote-breakdown";

import { useGift } from "./use-gift";

function useDebounced<T>(value: T, delay = 400) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/**
 * Gifts: give a fan some of your fan token, for example to lift them into a
 * membership tier. Pick a follower or type a username, email or wallet. The
 * price shown is everything you pay (the network fee); the tokens themselves
 * are newly issued, so nothing is taken from your balance.
 */
export function GiftsView() {
  const [recipient, setRecipient] = useState("");
  const [picked, setPicked] = useState<{ name: string | null; image: string | null } | null>(null);
  const [amountText, setAmountText] = useState("1");
  const amount = Number(amountText);
  const validAmount = Number.isInteger(amount) && amount >= 1;

  const typed = useDebounced(recipient.trim());
  const followers = api.gifts.followers.useQuery({
    search: picked ? undefined : typed || undefined,
  });
  const quote = api.gifts.quote.useQuery(
    { recipient: typed, amount: validAmount ? amount : 1 },
    {
      enabled: typed.length > 0 && validAmount,
      refetchInterval: 30_000,
      placeholderData: (previous) => previous,
    },
  );
  const me = api.account.me.useQuery();
  const sent = api.gifts.sent.useQuery();

  const flow = useGift({ recipient: recipient.trim(), amount }, () => {
    setRecipient("");
    setPicked(null);
    setAmountText("1");
  });
  const total = quote.data?.total;
  const ready = Boolean(quote.data?.ok) && validAmount && recipient.trim() === typed && !flow.busy;

  return (
    <PageBody wide className="grid gap-6">
      <PageHeader
        eyebrow="Sell"
        title="Gifts"
        description="Give a fan some of your fan token, for example to lift them into a membership tier. They must already have added your token to their wallet."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <section className="bg-surface grid content-start gap-5 rounded-[1.4rem] border-2 p-5 sm:p-6">
          <div className="grid gap-2">
            <Label htmlFor="gift-to">Who gets it</Label>
            <div className="relative">
              <Search className="text-fg-muted absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                id="gift-to"
                value={recipient}
                placeholder="Search followers, or paste a username, email or wallet"
                autoComplete="off"
                className="pl-9"
                onChange={(event) => {
                  setRecipient(event.target.value);
                  setPicked(null);
                }}
              />
            </div>
            {picked && (
              <p className="text-fg-muted flex items-center gap-2 text-sm">
                <Avatar src={picked.image} name={picked.name} className="size-6 text-[11px]" />
                Sending to <b className="text-fg">{picked.name ?? "this fan"}</b>
                <button
                  type="button"
                  aria-label="Choose someone else"
                  className="hover:text-fg ml-auto"
                  onClick={() => (setRecipient(""), setPicked(null))}
                >
                  <X className="size-4" />
                </button>
              </p>
            )}
            {!picked && (
              <div className="rounded-xl border">
                <p className="text-fg-muted flex items-center gap-1.5 border-b px-3 py-2 text-xs font-semibold tracking-wider uppercase">
                  <Users className="size-3.5" /> Your followers
                </p>
                {followers.isPending ? (
                  <Skeleton className="m-3 h-16" />
                ) : followers.isError ? (
                  <p className="text-fg-muted p-3 text-sm">Couldn&apos;t load your followers.</p>
                ) : followers.data.length === 0 ? (
                  <p className="text-fg-muted p-3 text-sm">
                    {typed
                      ? "No follower matches. You can still paste a username, email or wallet."
                      : "Nobody follows you yet."}
                  </p>
                ) : (
                  <ul className="max-h-56 divide-y overflow-y-auto">
                    {followers.data.map((follower) => (
                      <li key={follower.id}>
                        <button
                          type="button"
                          className="hover:bg-surface-2 flex w-full items-center gap-3 px-3 py-2 text-left"
                          onClick={() => {
                            setRecipient(follower.wallet);
                            setPicked({ name: follower.name, image: follower.image });
                          }}
                        >
                          <Avatar
                            src={follower.image}
                            name={follower.name}
                            className="size-8 text-xs"
                          />
                          <span className="min-w-0 text-sm">
                            <span className="block truncate font-medium">
                              {follower.name ?? "Fan"}
                            </span>
                            {follower.username && (
                              <span className="text-fg-muted block truncate text-xs">
                                @{follower.username}
                              </span>
                            )}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="gift-amount">How many {quote.data?.gift.code ?? "tokens"}</Label>
            <Input
              id="gift-amount"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={amountText}
              className="num max-w-40"
              onChange={(event) => setAmountText(event.target.value)}
            />
            {!validAmount && <p className="text-danger text-xs">Use a whole number from 1.</p>}
          </div>
        </section>

        <section className="bg-surface grid content-start gap-4 rounded-[1.4rem] border-2 p-5 sm:p-6">
          <h2 className="display flex items-center gap-2 text-lg">
            <Gift className="text-primary-text size-5" /> Your gift
          </h2>
          {quote.data?.gift.recipient && (
            <p className="text-sm">
              <b className="num">{validAmount ? amount.toLocaleString() : "?"}</b>{" "}
              {quote.data.gift.code} to <b>{quote.data.gift.recipient.name ?? "this fan"}</b>
            </p>
          )}
          {typed.length === 0 ? (
            <p className="text-fg-muted text-sm">
              Choose who gets it and the price shows here, before anything is signed.
            </p>
          ) : (
            <QuoteBreakdown
              quote={quote.data}
              balance={me.data?.balances.XLM}
              loading={quote.isPending}
            />
          )}
          <Button
            disabled={!ready}
            onClick={() => void flow.run(total ? <Money amount={total} currency="XLM" /> : null)}
            className="justify-self-start"
          >
            <Send />{" "}
            {flow.busy ? (
              "Working…"
            ) : total ? (
              <>
                Send gift · <Money amount={total} currency="XLM" />
              </>
            ) : (
              "Send gift"
            )}
          </Button>
          <p className="text-fg-faint text-xs">
            You pay only the network fee. Bandcoin never covers it, and nothing is signed until you
            press the button.
          </p>
        </section>
      </div>

      <section className="grid gap-3">
        <h2 className="display text-lg">Sent gifts</h2>
        {sent.isPending ? (
          <Skeleton className="h-24 w-full max-w-3xl rounded-xl" />
        ) : sent.isError ? (
          <ErrorState message="Couldn't load your gifts." onRetry={() => void sent.refetch()} />
        ) : sent.data.length === 0 ? (
          <EmptyState icon={Gift} title="No gifts yet" description="Gifts you send show up here." />
        ) : (
          <ul
            className={cn(
              "bg-surface max-w-3xl divide-y overflow-hidden rounded-[1.4rem] border-2",
            )}
          >
            {sent.data.map((gift) => (
              <li key={gift.id} className="flex items-center gap-3 px-4 py-3">
                <Avatar src={gift.recipient.image} name={gift.recipient.name} className="size-9" />
                <span className="min-w-0 flex-1 text-sm">
                  <span className="block truncate font-medium">{gift.recipient.name ?? "Fan"}</span>
                  <span className="text-fg-muted text-xs">{timeAgo(gift.createdAt)}</span>
                </span>
                <span className="num text-sm font-semibold">
                  {gift.amount.toLocaleString()} {gift.code}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

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
                variant="secondary"
                className="h-8 px-3 text-[13px]"
                onClick={flow.step.kind === "confirm" ? flow.stop : flow.close}
              >
                {flow.step.kind === "confirm" ? "Cancel" : "Close"}
              </Button>
            }
          />
        </ToastViewport>
      )}
    </PageBody>
  );
}
