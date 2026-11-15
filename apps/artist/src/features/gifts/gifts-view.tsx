"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleAlert,
  Gift,
  History,
  Search,
  Send,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { Button } from "@bandcoin/ui/components/button";
import { Input } from "@bandcoin/ui/components/input";
import { Tabs, TabsList, TabsTrigger } from "@bandcoin/ui/components/tabs";
import { cn } from "@bandcoin/ui/lib/cn";
import { Field } from "@bandcoin/ui/patterns/form-page";
import { PageBody, PageHeader } from "@bandcoin/ui/patterns/page-header";
import { ToastViewport, TransactionToast } from "@bandcoin/ui/patterns/transaction-toast";

import { Money } from "~/components/money";
import { useDebounced } from "~/lib/use-debounced";
import { api } from "~/trpc/react";

import { QuoteBreakdown } from "../payments/quote-breakdown";

import { type Follower, FollowerList } from "./followers-panel";
import { SentGifts } from "./sent-gifts";
import { useCollectibleGift, useGift } from "./use-gift";
import { type Choice, WhatPicker } from "./what-picker";

const STEPS = [
  { title: "What", desc: "Your token or an NFT" },
  { title: "Who", desc: "A fan to give it to" },
  { title: "Send", desc: "Check the price" },
] as const;

/**
 * Sending a gift, one step at a time: what (your fan token or an NFT copy you own),
 * who, then the price and Send. You pay only the network fee (plus 1 XLM that
 * holds a token gift a fan still has to claim), shown before anything is signed.
 */
export function GiftsView() {
  // useSearchParams needs a boundary; the page renders right away and the tab follows
  return (
    <Suspense>
      <GiftTabs />
    </Suspense>
  );
}

/** Two tabs: Send (the three steps) and Sent (gifts you've sent). */
function GiftTabs() {
  const router = useRouter();
  const tab = useSearchParams().get("tab") === "sent" ? "sent" : "send";
  return (
    <PageBody className="grid gap-6">
      <PageHeader
        eyebrow="Sell"
        title="Gifts"
        description="Send a fan some of your fan token, or an NFT copy you own, as a thank-you."
      />
      <Tabs
        value={tab}
        onValueChange={(value) => router.replace(value === "sent" ? "/gifts?tab=sent" : "/gifts")}
      >
        <TabsList variant="line" className="w-full justify-start overflow-x-auto border-b">
          <TabsTrigger value="send" className="flex-none">
            <Send /> Send
          </TabsTrigger>
          <TabsTrigger value="sent" className="flex-none">
            <History /> Sent
          </TabsTrigger>
        </TabsList>
      </Tabs>
      {tab === "send" ? <SendGift /> : <SentGifts />}
    </PageBody>
  );
}

function SendGift() {
  const [step, setStep] = useState(0);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [amountText, setAmountText] = useState("1");
  const [recipient, setRecipient] = useState("");
  const [picked, setPicked] = useState<Follower | null>(null);

  const amount = Number(amountText);
  const validAmount = Number.isInteger(amount) && amount >= 1;
  const typed = useDebounced(recipient.trim());
  const isTokens = choice?.kind === "tokens";
  const editionId = choice?.kind === "copy" ? choice.editionId : "";

  const tokenQuote = api.gifts.quote.useQuery(
    { recipient: typed, amount: validAmount ? amount : 1 },
    {
      enabled: isTokens && typed.length > 0 && validAmount && step > 0,
      refetchInterval: 30_000,
      placeholderData: (previous) => previous,
    },
  );
  const copyQuote = api.gifts.quoteCollectible.useQuery(
    { editionId, recipient: typed },
    {
      enabled: Boolean(editionId) && typed.length > 0 && step > 0,
      refetchInterval: 30_000,
      placeholderData: (previous) => previous,
    },
  );
  const quote = isTokens ? tokenQuote : copyQuote;
  const me = api.account.me.useQuery();

  const reset = () => {
    setStep(0);
    setChoice(null);
    setAmountText("1");
    setRecipient("");
    setPicked(null);
  };
  const tokenFlow = useGift({ recipient: recipient.trim(), amount }, reset);
  const copyFlow = useCollectibleGift({ editionId, recipient: recipient.trim() }, reset);
  const flow = isTokens ? tokenFlow : copyFlow;
  const busy = tokenFlow.busy || copyFlow.busy;

  // A fresh answer for exactly what's typed; an old one while it loads doesn't count.
  const settled =
    typed.length > 0 && recipient.trim() === typed && quote.data && !quote.isPlaceholderData;
  const blockers = settled
    ? quote.data.problems.filter((problem) => problem.code === "UNAVAILABLE")
    : [];
  const recipientName = picked?.name ?? (settled ? quote.data.gift.recipient?.name : null);
  const newEmail = settled && !isTokens ? copyQuote.data?.gift.newAccountEmail : null;
  const canNext =
    step === 0
      ? Boolean(choice) && (!isTokens || validAmount)
      : Boolean(settled) && blockers.length === 0;
  const total = settled ? quote.data.total : undefined;
  const ready = step === 2 && Boolean(settled) && Boolean(quote.data?.ok) && !busy;

  const what =
    choice?.kind === "tokens"
      ? `${validAmount ? amount.toLocaleString() : "?"} ${choice.code}`
      : choice
        ? `${choice.title} #${choice.tokenId}`
        : "";

  return (
    <>
      <section className="bg-surface border-fg/10 grid w-full gap-6 rounded-[1.4rem] border-2 p-5 sm:p-7">
        <ol aria-label="Steps" className="grid grid-cols-3 gap-2">
          {STEPS.map((entry, index) => {
            const current = index === step;
            const done = index < step;
            return (
              <li key={entry.title}>
                <button
                  type="button"
                  disabled={!done || busy}
                  onClick={() => setStep(index)}
                  aria-current={current ? "step" : undefined}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-xl p-2 text-left transition-colors",
                    current && "bg-primary/15",
                    done && "hover:bg-surface-2",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold",
                      current
                        ? "bg-primary text-primary-foreground"
                        : done
                          ? "bg-success/15 text-success"
                          : "bg-surface-2 text-fg-muted",
                    )}
                  >
                    {done ? <Check className="size-4" strokeWidth={3} /> : index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className={cn("block truncate text-sm", current && "font-semibold")}>
                      {entry.title}
                    </span>
                    <span className="text-fg-muted hidden truncate text-xs sm:block">
                      {entry.desc}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        {step === 0 && (
          <div className="grid gap-5">
            <h2 className="display text-2xl">What do you want to give?</h2>
            <WhatPicker
              choice={choice}
              onChoose={setChoice}
              amountText={amountText}
              onAmount={setAmountText}
              disabled={busy}
            />
          </div>
        )}

        {step === 1 && (
          <div className="grid gap-4">
            <h2 className="display text-2xl">Who gets {what}?</h2>
            <Field
              label="Recipient"
              htmlFor="gift-to"
              hint={
                newEmail
                  ? `Nobody uses ${newEmail} yet. We'll make a Bandcoin account for it when you send.`
                  : recipientName
                    ? `Sending to ${recipientName}`
                    : "Pick a follower below, or type their username, email or wallet."
              }
            >
              <div className="relative">
                <Search className="text-fg-muted absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <Input
                  id="gift-to"
                  value={recipient}
                  autoComplete="off"
                  placeholder="username, fan@email.com or G…"
                  className="pl-9"
                  onChange={(event) => {
                    setRecipient(event.target.value);
                    setPicked(null);
                  }}
                />
              </div>
            </Field>
            {blockers.map((problem) => (
              <p
                key={problem.message}
                className="bg-surface-2 flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
              >
                <CircleAlert className="text-warning mt-0.5 size-4 shrink-0" /> {problem.message}
              </p>
            ))}
            <FollowerList
              search={picked ? "" : typed}
              selected={picked?.wallet ?? null}
              onPick={(follower) => {
                setRecipient(follower.wallet);
                setPicked(follower);
              }}
            />
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-5">
            <h2 className="display text-2xl">Check and send</h2>
            <div className="bg-surface-2 flex items-center gap-3 rounded-xl p-4">
              {choice?.kind === "copy" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={choice.coverUrl}
                  alt=""
                  className="size-12 shrink-0 rounded-lg object-cover"
                />
              ) : (
                <span className="bg-surface flex size-12 shrink-0 items-center justify-center rounded-full">
                  <Gift className="text-primary-text size-5" />
                </span>
              )}
              <p className="min-w-0 text-sm">
                <b>{what}</b> to <b>{recipientName ?? newEmail ?? recipient.trim()}</b>
                {isTokens && tokenQuote.data?.gift.from === "STORAGE" && (
                  <span className="text-fg-muted block text-xs">From your storage</span>
                )}
              </p>
            </div>
            {isTokens && tokenQuote.data?.gift.claimable && (
              <p className="text-fg-muted text-xs">
                They haven&apos;t added your token yet, so they&apos;ll claim it in the Bandcoin
                app.
              </p>
            )}
            {newEmail && (
              <p className="text-fg-muted text-xs">
                We&apos;ll make a Bandcoin account for {newEmail} and email them how to sign in.
              </p>
            )}
            <QuoteBreakdown
              quote={settled ? quote.data : undefined}
              balance={me.data?.balances.XLM}
              loading={!settled}
            />
          </div>
        )}

        <div className="flex items-center justify-between gap-2 border-t pt-5">
          <Button
            type="button"
            variant="outline"
            disabled={step === 0 || busy}
            onClick={() => setStep(step - 1)}
          >
            <ArrowLeft /> Back
          </Button>
          {step < 2 ? (
            <Button key="next" type="button" disabled={!canNext} onClick={() => setStep(step + 1)}>
              Next <ArrowRight />
            </Button>
          ) : (
            <Button
              // Its own element, so a quick double-click on Next can't land on Send.
              key="send"
              disabled={!ready}
              onClick={() => void flow.run(total ? <Money amount={total} currency="XLM" /> : null)}
            >
              <Send />{" "}
              {busy ? (
                "Working…"
              ) : total ? (
                <>
                  Send gift · <Money amount={total} currency="XLM" />
                </>
              ) : (
                "Send gift"
              )}
            </Button>
          )}
        </div>
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
    </>
  );
}
