import { cn } from "@actiontokens/ui/lib/cn";
import { PageBody } from "@actiontokens/ui/patterns/page-header";

import { Money } from "~/components/money";
import { ItemPurchase } from "~/features/buy/item-purchase";
import { AccessNotice, ItemActivity, ItemDetails, MoreFromArtist, royaltyOf } from "./item-parts";
import { LockedContent } from "~/features/nft/locked-content";
import { UnlockNotice } from "~/features/nft/locked-preview";
import { SellPanel } from "~/features/resale/sell-panel";
import { StickyPanel } from "~/features/nft/sticky-panel";
import type { RouterOutputs } from "~/trpc/react";

type Item = RouterOutputs["item"]["bySlug"];
type More = RouterOutputs["catalog"]["moreFromArtist"];

/**
 * Everything under an item's hero. The price and buying stay in view on the
 * right, beside what you get, the rules and the map (when the item has them) and the details.
 * On small screens buying comes first, then the rest.
 */
export function ItemBody({
  item,
  more,
  artistName,
}: {
  item: Item;
  more: More;
  artistName: string;
}) {
  const primary = item.listings.find((listing) => listing.kind === "PRIMARY") ?? item.listings[0];
  const left = primary?.remaining ?? null;
  const royalty = royaltyOf(item);
  const hasLocked = item.lockedContent.length > 0;

  return (
    <PageBody wide className="grid gap-8">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(23rem,1fr)] xl:items-start">
        <StickyPanel
          id="buy"
          className="gloss border-fg bg-surface grid scroll-mt-24 content-start gap-4 rounded-[1.6rem] border-[3px] p-5 shadow-[8px_9px_0_0_var(--color-primary)] sm:p-6 xl:sticky xl:col-start-2 xl:row-start-1 xl:self-start"
        >
          <p className="text-fg-muted flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px]">
            {primary && (
              <>
                <span>
                  ≈ <Money amount={primary.priceUsd} currency="USD" />
                </span>
                <span aria-hidden>·</span>
              </>
            )}
            <span>
              {left === null
                ? "Open edition"
                : left === 0
                  ? "Sold out"
                  : `${left.toLocaleString()}${item.supply ? ` of ${item.supply.toLocaleString()}` : ""} left`}
            </span>
            {royalty > 0 && (
              <>
                <span aria-hidden>·</span>
                <span>{royalty}% resale royalty</span>
              </>
            )}
          </p>
          {item.access && !item.access.ok && (
            <AccessNotice access={item.access} organization={item.artist} />
          )}
          {item.ownedQuantity === 0 && <UnlockNotice pieces={item.lockedContent} />}
          <ItemPurchase
            itemTitle={item.title}
            listings={item.listings}
            nft={item.chainType === "CONTRACT_NFT"}
            stacked
          />
          {item.ownedQuantity > 0 &&
            (item.chainType === "CONTRACT_NFT" ||
              (item.chainType === "CLASSIC_TOKEN" && item.type !== "FAN_TOKEN")) && (
              <SellPanel
                itemId={item.id}
                itemTitle={item.title}
                owned={item.ownedQuantity}
                royaltyPercent={item.royaltyPercent}
              />
            )}
        </StickyPanel>

        {/* Without locked content the left is short: more from the artist fills it, and Details takes up any rest so both sides end level. */}
        <div
          className={cn(
            "grid min-w-0 gap-4 xl:col-start-1 xl:row-start-1",
            !hasLocked && "xl:grid-rows-[1fr_auto_auto] xl:self-stretch",
          )}
        >
          <LockedContent
            itemId={item.id}
            pieces={item.lockedContent}
            owned={item.ownedQuantity > 0}
            network={item.network}
          />
          <ItemDetails item={item} single={!hasLocked} />
          <ItemActivity sales={item.recentSales} open={!hasLocked} />
          {!hasLocked && <MoreFromArtist more={more} artistName={artistName} compact />}
        </div>
      </div>

      {hasLocked && <MoreFromArtist more={more} artistName={artistName} />}
    </PageBody>
  );
}
