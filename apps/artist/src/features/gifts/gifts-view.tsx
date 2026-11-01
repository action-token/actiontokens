"use client";

import { Gift, Send, Users } from "lucide-react";
import { useState } from "react";

import { Button } from "@bandcoin/ui/components/button";
import { Input } from "@bandcoin/ui/components/input";
import { Field, FormSection } from "@bandcoin/ui/patterns/form-page";
import { PageBody, PageHeader } from "@bandcoin/ui/patterns/page-header";
import { ToastViewport, TransactionToast } from "@bandcoin/ui/patterns/transaction-toast";

import { Money } from "~/components/money";
import { useDebounced } from "~/lib/use-debounced";
import { api } from "~/trpc/react";

import { QuoteBreakdown } from "../payments/quote-breakdown";

import { type Follower, FollowersPanel } from "./followers-panel";
import { SentGifts } from "./sent-gifts";
import { useCollectibleGift, useGift } from "./use-gift";
import { type Choice, WhatPicker } from "./what-picker";

/**
 * Gifts, laid out like Wadzzo's: who gets it, what (your fan token or an NFT
 * copy you own), the price, one Send button; your followers alongside. You
 * pay only the network fee (plus 1 XLM that holds a token gift a fan still has
 * to claim), shown before anything is signed.
 */
export function GiftsView() {
  const [recipient, setRecipient] = useState("");
  const [picked, setPicked] = useState<Follower | null>(null);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [amountText, setAmountText] = useState("1");
  const amount = Number(amountText);
  const validAmount = Number.isInteger(amount) && amount >= 1;
  const typed = useDebounced(recipient.trim());
  const isTokens = choice?.kind === "tokens";
  const editionId = choice?.kind === "copy" ? choice.editionId : "";

  const tokenQuote = api.gifts.quote.useQuery(
    { recipient: typed, amount: validAmount ? amount : 1 },
    {
      enabled: isTokens && typed.length > 0 && validAmount,
      refetchInterval: 30_000,
      placeholderData: (previous) => previous,
    },
  );
  const copyQuote = api.gifts.quoteCollectible.useQuery(
    { editionId, recipient: typed },
    {
      enabled: Boolean(editionId) && typed.length > 0,
      refetchInterval: 30_000,
      placeholderData: (previous) => previous,
    },
  );
  const me = api.account.me.useQuery();

  const reset = () => {
    setRecipient("");
    setPicked(null);
    setChoice(null);
    setAmountText("1");
  };
  const tokenFlow = useGift({ recipient: recipient.trim(), amount }, reset);
  const copyFlow = useCollectibleGift({ editionId, recipient: recipient.trim() }, reset);
  const flow = isTokens ? tokenFlow : copyFlow;
  const busy = tokenFlow.busy || copyFlow.busy;

  const quote = isTokens ? tokenQuote : copyQuote;
  const priced = Boolean(choice) && typed.length > 0 && (!isTokens || validAmount);
  const total = priced ? quote.data?.total : undefined;
  const ready = priced && Boolean(quote.data?.ok) && recipient.trim() === typed && !busy;
  const who =
    picked?.name ??
    (isTokens ? tokenQuote.data?.gift.recipient?.name : copyQuote.data?.gift.recipient?.name);
  const newEmail = !isTokens ? copyQuote.data?.gift.newAccountEmail : null;

  return (
    <PageBody wide className="grid gap-8">
      <PageHeader
        eyebrow="Sell"
        title="Gifts"
        description="Send a fan some of your fan token, or an NFT copy you own, as a thank-you."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid content-start gap-5">
          <FormSection
            title="Who"
            icon={Users}
            description="Pick a follower, or type their username, email or wallet."
          >
            <Field
              label="Recipient"
              htmlFor="gift-to"
              hint={
                newEmail
                  ? `Nobody uses ${newEmail} yet. We'll make a Bandcoin account for it when you send.`
                  : who
                    ? `Sending to ${who}`
                    : undefined
              }
            >
              <Input
                id="gift-to"
                value={recipient}
                autoComplete="off"
                placeholder="username, fan@email.com or G…"
                onChange={(event) => {
                  setRecipient(event.target.value);
                  setPicked(null);
                }}
              />
            </Field>
          </FormSection>

          <FormSection title="What" icon={Gift}>
            <WhatPicker choice={choice} onChoose={setChoice} disabled={busy} />
            {isTokens && (
              <Field
                label={`How many ${choice.code}`}
                htmlFor="gift-amount"
                error={validAmount ? null : "Use a whole number from 1."}
                hint={
                  tokenQuote.data?.gift.claimable
                    ? "They haven't added your token yet, so they'll claim it in the Bandcoin app."
                    : undefined
                }
              >
                <Input
                  id="gift-amount"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  value={amountText}
                  className="num max-w-48"
                  onChange={(event) => setAmountText(event.target.value)}
                />
              </Field>
            )}
          </FormSection>

          <section className="bg-surface border-fg/10 grid gap-3 rounded-[1.4rem] border-2 p-5">
            <h2 className="eyebrow">Price</h2>
            {priced ? (
              <QuoteBreakdown
                quote={quote.data}
                balance={me.data?.balances.XLM}
                // A new recipient or copy: show loading, not the last answer.
                loading={quote.isPending || quote.isPlaceholderData}
              />
            ) : (
              <p className="text-fg-muted text-sm">
                Choose who gets it and what, and the price shows here before anything is signed.
              </p>
            )}
          </section>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <p className="text-fg-faint text-xs">You pay only the network fee.</p>
            <Button
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
          </div>
        </div>

        <FollowersPanel
          selected={picked?.wallet ?? null}
          onPick={(follower) => {
            setRecipient(follower.wallet);
            setPicked(follower);
          }}
        />
      </div>

      <SentGifts />

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
