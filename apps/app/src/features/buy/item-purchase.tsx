"use client";

import { useState } from "react";

import { cn } from "@bandcoin/ui/lib/cn";

import { Money } from "~/components/money";
import type { RouterOutputs } from "~/trpc/react";

import { BuyPanel } from "./buy-panel";

type Listing = RouterOutputs["item"]["bySlug"]["listings"][number];

/** The buy panel, plus a seller picker when fans are reselling copies too. */
export function ItemPurchase({
  itemTitle,
  listings,
  nft = false,
}: {
  itemTitle: string;
  listings: Listing[];
  /** A contract NFT: paid in BANDCOIN or by card, up to 20 copies at a time */
  nft?: boolean;
}) {
  // An artist may buy their own contract NFT (to gift a copy); other own listings aren't buyable.
  const buyable = listings.filter(
    (listing) => !listing.isOwn || (nft && listing.kind === "PRIMARY"),
  );
  const [selectedId, setSelectedId] = useState(buyable[0]?.id);
  const selected = buyable.find((listing) => listing.id === selectedId) ?? buyable[0];

  if (!selected) {
    return (
      <aside className="text-fg-muted text-sm">
        {listings.length > 0
          ? "You're the only seller of this item."
          : "This item isn't for sale right now."}
      </aside>
    );
  }

  return (
    <div className="grid content-start gap-4">
      <BuyPanel key={selected.id} itemTitle={itemTitle} listing={selected} nft={nft} />
      {buyable.length > 1 && (
        <section aria-label="Sellers" className="bg-surface grid gap-1 rounded-xl border p-3">
          <h2 className="eyebrow px-2 pt-1 pb-2">Choose a seller</h2>
          {buyable.map((listing) => (
            <button
              key={listing.id}
              type="button"
              aria-pressed={listing.id === selected.id}
              onClick={() => setSelectedId(listing.id)}
              className={cn(
                "hover:bg-surface-2 flex items-center justify-between gap-3 rounded-md px-2 py-2 text-left text-sm",
                listing.id === selected.id && "bg-primary-soft",
              )}
            >
              <span className="min-w-0 truncate">
                {listing.kind === "PRIMARY"
                  ? "From the artist"
                  : (listing.seller.displayName ?? listing.seller.username ?? "A fan")}
                <span className="text-fg-faint block text-xs">
                  {listing.remaining === null ? "Unlimited" : `${listing.remaining} left`}
                </span>
              </span>
              <Money
                amount={listing.priceBandcoin}
                currency="BANDCOIN"
                className="shrink-0 text-[13px] font-semibold"
              />
            </button>
          ))}
        </section>
      )}
    </div>
  );
}
