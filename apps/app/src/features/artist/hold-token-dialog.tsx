"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useEffect } from "react";

import { Button } from "@bandcoin/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@bandcoin/ui/components/dialog";

import { Money } from "~/components/money";
import { payOf, shownLines } from "~/lib/recharge";
import { api } from "~/trpc/react";

import { QuoteBreakdown } from "../recharge/quote-breakdown";
import { RechargeToast } from "../recharge/recharge-toast";
import { useRecharge } from "../recharge/use-recharge";

export type TokenOffer = { code: string; artistId: string };

/**
 * After following an artist who has a fan token: "Hold NOVA too?". The fan sees
 * the server's price first (about 0.5 XLM worth of BANDCOIN, which the line
 * locks and they get back if they remove it) and nothing happens unless they
 * tap Hold. Following never waits on this.
 */
export function HoldTokenDialog({
  offer,
  onClose,
}: {
  offer: TokenOffer | null;
  onClose: () => void;
}) {
  const { status } = useSession();
  const flow = useRecharge();
  const quote = api.recharge.quote.useQuery(
    { kind: "TOKEN_TRUST", artistId: offer?.artistId ?? "" },
    {
      enabled: Boolean(offer) && status === "authenticated",
      placeholderData: (previous) => previous,
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

  async function hold() {
    if (!offer || !data?.ok) return;
    onClose();
    await flow.run({
      kind: "TOKEN_TRUST",
      artistId: offer.artistId,
      summary: (
        <>
          <Money amount={data.total} currency="BANDCOIN" /> to hold {offer.code}
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
            <DialogTitle>Hold {offer?.code} too?</DialogTitle>
            <DialogDescription>
              You&apos;re following. Holding their fan token shows you&apos;re a real fan. It locks
              0.5 XLM in your wallet, which you get back if you remove it. Nothing happens unless
              you tap Hold.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <QuoteBreakdown
              lines={data ? shownLines(data) : []}
              pay={data ? payOf(data) : null}
              problems={data?.problems ?? []}
              loading={quote.isPending}
              error={quote.error?.message}
            />
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="ghost" onClick={onClose}>
              Not now
            </Button>
            {needsFunds ? (
              <Button asChild>
                <Link href="/recharge">Add BANDCOIN</Link>
              </Button>
            ) : (
              <Button
                disabled={!data?.ok || blocked || flow.busy || quote.isFetching}
                onClick={() => void hold()}
              >
                Hold {offer?.code}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <RechargeToast flow={flow} />
    </>
  );
}
