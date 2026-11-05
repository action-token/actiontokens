"use client";

import { Coins } from "lucide-react";
import { useState } from "react";

import { Button } from "@bandcoin/ui/components/button";
import { cn } from "@bandcoin/ui/lib/cn";

import { Money } from "~/components/money";
import { api } from "~/trpc/react";

import { BuyPanel } from "../buy/buy-panel";

const tokens = (amount: string) =>
  Number(amount).toLocaleString("en-US", { maximumFractionDigits: 7 });

/**
 * The artist's page assets for sale: bundles of their fan token, each bought
 * whole by one fan. Opening an offer shows the usual buy panel.
 */
export function PageAssetOffers({ slug }: { slug: string }) {
  const data = api.artist.pageAssets.useQuery({ slug });
  const [open, setOpen] = useState<string | null>(null);
  if (!data.data?.code || data.data.offers.length === 0) return null;
  const { code, offers } = data.data;

  return (
    <section className="grid gap-4" aria-label="Page assets">
      <div>
        <h2 className="display text-3xl">{code} bundles</h2>
        <p className="text-fg-muted text-sm">
          The artist&apos;s fan token, sold in bundles. Each one goes whole to the first fan to buy
          it.
        </p>
      </div>
      <ul className="grid gap-3">
        {offers.map((offer) => (
          <li
            key={offer.id}
            className={cn(
              "bg-surface grid gap-4 rounded-[1.2rem] border-2 p-4",
              open === offer.id && "border-fg",
            )}
          >
            <div className="flex flex-wrap items-center gap-3">
              <Coins className="text-primary-text size-6 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="display text-2xl">
                  <span className="num">{tokens(offer.amount)}</span> {code}
                </p>
                {offer.note && <p className="text-fg-muted text-sm">{offer.note}</p>}
                <p className="text-fg-muted num text-xs">
                  <Money amount={offer.listing.priceBandcoin} currency="BANDCOIN" /> · $
                  {tokens(offer.listing.priceUsd)}
                  {offer.priceXlm && ` · ${tokens(offer.priceXlm)} XLM`}
                </p>
              </div>
              {!offer.listing.isOwn && (
                <Button
                  variant={open === offer.id ? "secondary" : "default"}
                  onClick={() => setOpen(open === offer.id ? null : offer.id)}
                >
                  {open === offer.id ? "Close" : "Buy"}
                </Button>
              )}
            </div>
            {open === offer.id && (
              <BuyPanel itemTitle={`${tokens(offer.amount)} ${code}`} listing={offer.listing} />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
