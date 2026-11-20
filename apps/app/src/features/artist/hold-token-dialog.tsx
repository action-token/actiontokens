"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

import { Button } from "@actiontokens/ui/components/button";
import { cn } from "@actiontokens/ui/lib/cn";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@actiontokens/ui/components/dialog";

import { Money } from "~/components/money";
import type { DisplayCurrency } from "~/lib/format";
import { payOf, shownLines } from "~/lib/recharge";
import { api } from "~/trpc/react";

import { CurrencyPicker } from "../buy/currency-picker";
import { useSquareCard } from "../buy/square-card";
import { QuoteBreakdown } from "../recharge/quote-breakdown";
import { RechargeToast } from "../recharge/recharge-toast";
import { useRecharge } from "../recharge/use-recharge";

export type TokenOffer = { code: string; artistId: string };

/**
 * After following an artist who has a fan token: "Subscribe with NOVA?". The fan
 * picks BANDCOIN, XLM, USDC or a card (plan 33) and sees the server's price
 * first: the 0.5 XLM the line locks (theirs back if they remove it), the
 * platform fee and, by card, the rest of the $1 minimum as BANDCOIN. Nothing
 * happens unless they tap Subscribe. Following never waits on this.
 */
export function HoldTokenDialog({
  offer,
  onClose,
  onSubscribed,
}: {
  offer: TokenOffer | null;
  onClose: () => void;
  /** The trustline is open: the fan is a subscriber now */
  onSubscribed?: () => void;
}) {
  const { status } = useSession();
  const flow = useRecharge();
  const [currency, setCurrency] = useState<DisplayCurrency>("BANDCOIN");
  const byCard = currency === "USD";
  const me = api.account.me.useQuery(undefined, { enabled: status === "authenticated" });
  const { container: cardField, ...card } = useSquareCard(Boolean(offer) && byCard);
  const quote = api.recharge.quote.useQuery(
    { kind: "TOKEN_TRUST", artistId: offer?.artistId ?? "", currency },
    {
      enabled: Boolean(offer) && status === "authenticated",
      refetchInterval: 30_000,
      // Never show another currency's price while the new one loads.
      placeholderData: (previous) =>
        previous?.kind === "TOKEN_TRUST" && previous.currency === currency ? previous : undefined,
    },
  );
  const data = quote.data?.kind === "TOKEN_TRUST" ? quote.data : null;
  const needsFunds = data?.problems.some((p) => p.code === "INSUFFICIENT_FUNDS") ?? false;
  const blocked = data?.problems.some((p) => p.code === "UNAVAILABLE") ?? false;

  // Nothing to offer (they already hold it, or the artist has no token): close without a word.
  const nothingToOffer = data?.problems.some(
    (p) => p.code === "UNAVAILABLE" && /already hold|no fan token/i.test(p.message),
  );
  useEffect(() => {
    if (offer && nothingToOffer) onClose();
  }, [offer, nothingToOffer, onClose]);

  const done = flow.step?.kind === "success";
  useEffect(() => {
    if (done) onSubscribed?.();
    // Once per finished order; the callback itself may change every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  async function hold() {
    if (!offer || !data?.ok) return;
    // The card field lives in the dialog: take its token before closing it.
    const cardToken = byCard ? await card.tokenize() : undefined;
    if (byCard && !cardToken) return;
    onClose();
    await flow.run({
      kind: "TOKEN_TRUST",
      artistId: offer.artistId,
      currency: data.currency,
      card: cardToken ?? undefined,
      summary: (
        <>
          <Money amount={data.total} currency={data.currency} /> to subscribe with {offer.code}
        </>
      ),
      success: {
        title: `Done. You now hold ${offer.code}.`,
        body: "It can take a few seconds to show in your wallet.",
      },
    });
  }

  return (
    <>
      <Dialog open={Boolean(offer)} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Subscribe with {offer?.code}</DialogTitle>
            <DialogDescription>
              Subscribers are followers who trust the artist&apos;s fan token, and can open posts,
              stories and pins made for subscribers. It locks 0.5 XLM in your wallet, which you get
              back if you remove the line. Nothing happens unless you tap Subscribe.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <CurrencyPicker
              value={currency}
              onChange={setCurrency}
              balances={me.data?.balances}
              disabled={flow.busy}
            />
            <QuoteBreakdown
              lines={data ? shownLines(data) : []}
              pay={data ? payOf(data) : null}
              problems={data?.problems ?? []}
              loading={quote.isPending}
              error={quote.error?.message}
            />
            {byCard && (
              <div className="grid gap-1.5">
                <div
                  ref={cardField}
                  className={cn(
                    "min-h-[90px]",
                    card.loading && "bg-surface-2 animate-pulse rounded-md",
                  )}
                />
                {card.error && <p className="text-danger text-xs">{card.error}</p>}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="ghost" onClick={onClose}>
              Not now
            </Button>
            {needsFunds ? (
              <Button asChild>
                <Link href="/recharge">
                  {currency === "BANDCOIN" ? "Add BANDCOIN" : "Add funds"}
                </Link>
              </Button>
            ) : (
              <Button
                disabled={
                  !data?.ok || blocked || flow.busy || quote.isFetching || (byCard && !card.ready)
                }
                onClick={() => void hold()}
              >
                Subscribe
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <RechargeToast flow={flow} />
    </>
  );
}
