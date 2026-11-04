"use client";

import { Tag } from "lucide-react";
import Link from "next/link";
import { useDeferredValue, useState } from "react";

import { Button } from "@bandcoin/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@bandcoin/ui/components/dialog";
import { Input } from "@bandcoin/ui/components/input";
import { Label } from "@bandcoin/ui/components/label";
import { PriceBreakdown } from "@bandcoin/ui/patterns/price-breakdown";
import { QuantityStepper } from "@bandcoin/ui/patterns/quantity-stepper";
import { ToastViewport, TransactionToast } from "@bandcoin/ui/patterns/transaction-toast";

import { Money } from "~/components/money";
import { api } from "~/trpc/react";

import { useResaleOrder } from "./use-resale-order";

const PRICE = /^\d{1,12}(\.\d{1,7})?$/;

/**
 * "Sell your copies" on an item you hold: how many, a BANDCOIN price and a USD
 * price (the card price; XLM and USDC follow it), and what you'd get for each
 * copy after the artist's royalty. The server quotes the cost of listing first.
 */
export function SellPanel({
  itemId,
  itemTitle,
  owned,
  royaltyPercent,
}: {
  itemId: string;
  itemTitle: string;
  owned: number;
  royaltyPercent: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(1);
  const [bandcoin, setBandcoin] = useState("");
  const [usd, setUsd] = useState("");
  const order = useResaleOrder();

  const input = {
    itemId,
    amount,
    priceBandcoin: useDeferredValue(bandcoin.trim()),
    priceUsd: useDeferredValue(usd.trim()),
  };
  const priced = PRICE.test(input.priceBandcoin) && PRICE.test(input.priceUsd);
  const quote = api.resale.quoteList.useQuery(input, {
    enabled: open && priced,
    placeholderData: (previous) => previous,
  });

  async function list() {
    setOpen(false);
    await order.run({
      kind: "list",
      input,
      summary: (
        <>
          List {amount} × {itemTitle}
        </>
      ),
      done: {
        title: `Listed: ${amount} × ${itemTitle}`,
        body: "Buyers can see it on the item page now. Manage it under Selling.",
      },
    });
  }

  return (
    <section aria-label="Sell" className="bg-surface grid gap-3 rounded-xl border p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="display text-base">Sell your copies</h2>
          <p className="text-fg-muted text-[13px]">
            You hold {owned.toLocaleString()}. Set your own price.
          </p>
        </div>
        <Button onClick={() => setOpen(true)} disabled={order.busy}>
          <Tag /> Sell
        </Button>
      </div>
      <Link href="/selling" className="text-primary-text text-[13px] font-semibold hover:underline">
        See what you&apos;re selling
      </Link>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="display">Sell {itemTitle}</DialogTitle>
            <DialogDescription>
              Buyers pay 2.5% on top of your price.
              {royaltyPercent && Number(royaltyPercent) > 0
                ? ` The artist's ${royaltyPercent}% resale royalty comes out of your share.`
                : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label>How many copies</Label>
              <QuantityStepper value={amount} onChange={setAmount} max={Math.max(1, owned)} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="sell-bandcoin">Price each, BANDCOIN</Label>
                <Input
                  id="sell-bandcoin"
                  inputMode="decimal"
                  placeholder="25000"
                  value={bandcoin}
                  onChange={(event) => setBandcoin(event.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="sell-usd">Price each, USD (card)</Label>
                <Input
                  id="sell-usd"
                  inputMode="decimal"
                  placeholder="2.50"
                  value={usd}
                  onChange={(event) => setUsd(event.target.value)}
                />
              </div>
            </div>

            {quote.data && priced && (
              <>
                <p className="bg-surface-2 rounded-lg border p-3 text-[13px]">
                  You get, for each copy:{" "}
                  <b>
                    <Money amount={quote.data.net.bandcoin.net} currency="BANDCOIN" />
                  </b>{" "}
                  or{" "}
                  <b>
                    <Money amount={quote.data.net.usd.net} currency="USD" />
                  </b>
                  {Number(quote.data.net.royaltyPercent) > 0 && (
                    <span className="text-fg-muted">
                      {" "}
                      (after the {quote.data.net.royaltyPercent}% royalty)
                    </span>
                  )}
                </p>
                <div className="grid gap-2">
                  <p className="text-fg-muted text-xs font-semibold tracking-wider uppercase">
                    What listing costs
                  </p>
                  <PriceBreakdown
                    lines={quote.data.lines
                      .filter((line) => line.key !== "total")
                      .map((line) => ({
                        label: line.label,
                        value: <Money amount={line.amount} currency="XLM" />,
                      }))}
                    total={<Money amount={quote.data.total} currency="XLM" />}
                  />
                  <p className="text-fg-muted text-xs">{quote.data.note}</p>
                </div>
                {quote.data.problems.map((problem) => (
                  <p key={problem.message} role="alert" className="text-danger text-sm">
                    {problem.message}
                  </p>
                ))}
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Not now
            </Button>
            <Button
              onClick={() => void list()}
              disabled={!priced || !quote.data?.ok || quote.isFetching}
            >
              List {amount} for sale
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {order.step && (
        <ToastViewport>
          <TransactionToast
            key={order.step.kind}
            step={order.step}
            onSend={order.send}
            onCancel={order.stop}
            actions={
              order.step.kind === "success" ? (
                <Button asChild size="sm" variant="secondary" className="h-8 px-3 text-[13px]">
                  <Link href="/selling">See your listings</Link>
                </Button>
              ) : undefined
            }
          />
        </ToastViewport>
      )}
    </section>
  );
}
