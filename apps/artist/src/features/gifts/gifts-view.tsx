"use client";

import { Coins, Gift, Send, Sparkles } from "lucide-react";
import { useState } from "react";

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
import { useDebounced } from "~/lib/use-debounced";
import { api } from "~/trpc/react";

import { QuoteBreakdown } from "../payments/quote-breakdown";

import { CollectibleGift } from "./collectible-gift";
import { type Picked, RecipientField } from "./recipient-field";
import { useGift } from "./use-gift";

type Kind = "tokens" | "collectible";

const KINDS: { value: Kind; title: string; description: string; icon: typeof Coins }[] = [
  {
    value: "tokens",
    title: "Tokens",
    description: "Send an amount of your fan token",
    icon: Coins,
  },
  {
    value: "collectible",
    title: "Collectible",
    description: "Send one NFT copy you own",
    icon: Sparkles,
  },
];

/**
 * Gifts, as on the old Bandcoin: some of your fan token (for example to lift a
 * fan into a membership tier), or one NFT copy you own. You pay only the
 * network fee, shown before anything is signed.
 */
export function GiftsView() {
  const [kind, setKind] = useState<Kind>("tokens");
  const sent = api.gifts.sent.useQuery();

  return (
    <PageBody wide className="grid gap-6">
      <PageHeader
        eyebrow="Sell"
        title="Gifts"
        description="Give a fan some of your fan token, or one NFT copy you own. Pick a follower or type a username, email or wallet."
      />

      <div role="radiogroup" aria-label="What to give" className="grid gap-3 sm:grid-cols-2">
        {KINDS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={kind === option.value}
            onClick={() => setKind(option.value)}
            className={cn(
              "bg-surface hover:border-border-strong flex items-center gap-3 rounded-[1.2rem] border-2 p-4 text-left",
              kind === option.value && "border-primary-text bg-primary-soft",
            )}
          >
            <option.icon className="text-primary-text size-6 shrink-0" />
            <span>
              <b className="block text-sm">{option.title}</b>
              <span className="text-fg-muted text-xs">{option.description}</span>
            </span>
          </button>
        ))}
      </div>

      {kind === "tokens" ? <TokenGift /> : <CollectibleGift />}

      <section className="grid gap-3">
        <h2 className="display text-lg">Sent gifts</h2>
        {sent.isPending ? (
          <Skeleton className="h-24 w-full rounded-xl" />
        ) : sent.isError ? (
          <ErrorState message="Couldn't load your gifts." onRetry={() => void sent.refetch()} />
        ) : sent.data.length === 0 ? (
          <EmptyState icon={Gift} title="No gifts yet" description="Gifts you send show up here." />
        ) : (
          <ul className="bg-surface divide-y overflow-hidden rounded-[1.4rem] border-2">
            {sent.data.map((gift) => (
              <li key={gift.id} className="flex items-center gap-3 px-4 py-3">
                <Avatar src={gift.recipient.image} name={gift.recipient.name} className="size-9" />
                <span className="min-w-0 flex-1 text-sm">
                  <span className="block truncate font-medium">{gift.recipient.name ?? "Fan"}</span>
                  <span className="text-fg-muted text-xs">{timeAgo(gift.createdAt)}</span>
                </span>
                <span className="num text-right text-sm font-semibold">
                  {gift.tokens
                    ? `${gift.tokens.amount.toLocaleString()} ${gift.tokens.code}`
                    : gift.copy
                      ? `${gift.copy.title} #${gift.copy.tokenId}`
                      : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageBody>
  );
}

/**
 * Some of your fan token. It comes from your storage account (or is newly
 * issued without one); a fan who hasn't added your token yet gets it as a
 * gift to claim, and you pay the 1 XLM that holds it.
 */
function TokenGift() {
  const [recipient, setRecipient] = useState("");
  const [picked, setPicked] = useState<Picked | null>(null);
  const [amountText, setAmountText] = useState("1");
  const amount = Number(amountText);
  const validAmount = Number.isInteger(amount) && amount >= 1;

  const typed = useDebounced(recipient.trim());
  const quote = api.gifts.quote.useQuery(
    { recipient: typed, amount: validAmount ? amount : 1 },
    {
      enabled: typed.length > 0 && validAmount,
      refetchInterval: 30_000,
      placeholderData: (previous) => previous,
    },
  );
  const me = api.account.me.useQuery();

  const flow = useGift({ recipient: recipient.trim(), amount }, () => {
    setRecipient("");
    setPicked(null);
    setAmountText("1");
  });
  const total = quote.data?.total;
  const ready = Boolean(quote.data?.ok) && validAmount && recipient.trim() === typed && !flow.busy;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
      <section className="bg-surface grid content-start gap-5 rounded-[1.4rem] border-2 p-5 sm:p-6">
        <RecipientField
          value={recipient}
          typed={typed}
          picked={picked}
          hint="Search followers, or paste a username, email or wallet"
          onChange={(value, next) => {
            setRecipient(value);
            setPicked(next);
          }}
        />

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
            {quote.data.gift.from === "STORAGE" && (
              <span className="text-fg-muted"> · from your storage</span>
            )}
          </p>
        )}
        {quote.data?.gift.claimable && (
          <p className="text-fg-muted text-xs">
            They haven&apos;t added your token yet, so they&apos;ll claim it in the Bandcoin app.
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
    </div>
  );
}
