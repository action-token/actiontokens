"use client";

import { Gift, Send, Sparkles } from "lucide-react";
import { useState } from "react";

import { Button } from "@bandcoin/ui/components/button";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { cn } from "@bandcoin/ui/lib/cn";
import { EmptyState } from "@bandcoin/ui/patterns/empty-state";
import { ErrorState } from "@bandcoin/ui/patterns/error-state";
import { ToastViewport, TransactionToast } from "@bandcoin/ui/patterns/transaction-toast";

import { Money } from "~/components/money";
import { useDebounced } from "~/lib/use-debounced";
import { api } from "~/trpc/react";

import { QuoteBreakdown } from "../payments/quote-breakdown";
import { FAN_APP_URL } from "../shell/links";

import { type Picked, RecipientField } from "./recipient-field";
import { useCollectibleGift } from "./use-gift";

/**
 * Give one copy of a contract NFT you own. Its locked content and anything
 * already unlocked go with it. A copy on sale has to come off sale first.
 */
export function CollectibleGift() {
  const [editionId, setEditionId] = useState<string | null>(null);
  const [recipient, setRecipient] = useState("");
  const [picked, setPicked] = useState<Picked | null>(null);
  const typed = useDebounced(recipient.trim());

  const copies = api.gifts.copies.useQuery();
  const quote = api.gifts.quoteCollectible.useQuery(
    { editionId: editionId ?? "", recipient: typed },
    {
      enabled: Boolean(editionId) && typed.length > 0,
      refetchInterval: 30_000,
      placeholderData: (previous) => previous,
    },
  );
  const me = api.account.me.useQuery();
  const flow = useCollectibleGift(
    { editionId: editionId ?? "", recipient: recipient.trim() },
    () => {
      setEditionId(null);
      setRecipient("");
      setPicked(null);
    },
  );

  const total = quote.data?.total;
  const ready =
    Boolean(editionId) && Boolean(quote.data?.ok) && recipient.trim() === typed && !flow.busy;
  const chosen = copies.data
    ?.flatMap((nft) => nft.copies.map((copy) => ({ ...copy, title: nft.title })))
    .find((copy) => copy.editionId === editionId);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
      <section className="bg-surface grid content-start gap-5 rounded-[1.4rem] border-2 p-5 sm:p-6">
        <div className="grid gap-2">
          <h2 className="text-sm font-semibold">Which copy</h2>
          {copies.isPending ? (
            <Skeleton className="h-28 w-full rounded-xl" />
          ) : copies.isError ? (
            <ErrorState
              message="Couldn't load your copies."
              onRetry={() => void copies.refetch()}
            />
          ) : copies.data.length === 0 ? (
            <EmptyState
              icon={Sparkles}
              title="No NFT copies yet"
              description="Buy a copy of one of your NFTs in the fan app (the price comes back to you, so you pay only the fees), then gift it here."
              action={
                <Button asChild variant="secondary">
                  <a href={`${FAN_APP_URL}/marketplace`} target="_blank" rel="noreferrer">
                    Open the fan app
                  </a>
                </Button>
              }
            />
          ) : (
            <ul className="grid gap-3">
              {copies.data.map((nft) => (
                <li key={nft.itemId} className="grid gap-2 rounded-xl border p-3">
                  <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={nft.coverUrl}
                      alt=""
                      className="size-10 shrink-0 rounded-md object-cover"
                    />
                    <b className="min-w-0 truncate text-sm">{nft.title}</b>
                  </div>
                  <div
                    role="radiogroup"
                    aria-label={`Copies of ${nft.title}`}
                    className="flex flex-wrap gap-2"
                  >
                    {nft.copies.map((copy) => (
                      <button
                        key={copy.editionId}
                        type="button"
                        role="radio"
                        aria-checked={copy.editionId === editionId}
                        disabled={copy.listed || flow.busy}
                        onClick={() => setEditionId(copy.editionId)}
                        className={cn(
                          "bg-surface-2 hover:border-border-strong grid gap-0.5 rounded-md border px-3 py-2 text-left text-xs disabled:opacity-50",
                          copy.editionId === editionId && "border-primary-text bg-primary-soft",
                        )}
                      >
                        <b className="num text-[13px]">#{copy.tokenId}</b>
                        <span className="text-fg-muted">
                          {copy.listed
                            ? "On sale"
                            : copy.unlocked + copy.locked > 0
                              ? `${copy.unlocked} of ${copy.unlocked + copy.locked} unlocked`
                              : "No locked content"}
                        </span>
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {copies.data?.some((nft) => nft.copies.some((copy) => copy.listed)) && (
            <p className="text-fg-faint text-xs">
              A copy on sale can&apos;t be gifted. Take it off sale first.
            </p>
          )}
        </div>

        <RecipientField
          value={recipient}
          typed={typed}
          picked={picked}
          hint="Search followers, or type a username, email or wallet"
          onChange={(value, next) => {
            setRecipient(value);
            setPicked(next);
          }}
        />
      </section>

      <section className="bg-surface grid content-start gap-4 rounded-[1.4rem] border-2 p-5 sm:p-6">
        <h2 className="display flex items-center gap-2 text-lg">
          <Gift className="text-primary-text size-5" /> Your gift
        </h2>
        {chosen && (
          <p className="text-sm">
            <b>{chosen.title}</b> <span className="num">#{chosen.tokenId}</span>
            {quote.data?.gift.recipient && (
              <>
                {" "}
                to <b>{quote.data.gift.recipient.name ?? "this fan"}</b>
              </>
            )}
          </p>
        )}
        {quote.data?.gift.newAccountEmail && (
          <p className="text-fg-muted text-xs">
            Nobody uses {quote.data.gift.newAccountEmail} on Bandcoin yet. We&apos;ll make an
            account for it when you send, and they&apos;ll sign in with that email to see the copy.
          </p>
        )}
        {!editionId || typed.length === 0 ? (
          <p className="text-fg-muted text-sm">
            Pick a copy and who gets it, and the price shows here before anything is signed.
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
          You pay only the network fee, never more than shown. Nothing is signed until you press the
          button.
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
