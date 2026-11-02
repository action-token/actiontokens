import { PageBody } from "@bandcoin/ui/patterns/page-header";

import { ItemPurchase } from "~/features/buy/item-purchase";
import { AccessNotice, ItemActivity, ItemDetails, MoreFromArtist } from "./item-parts";
import { LockedContent } from "~/features/nft/locked-content";
import { UnlockNotice } from "~/features/nft/locked-preview";
import { StickyPanel } from "~/features/nft/sticky-panel";
import type { RouterOutputs } from "~/trpc/react";

type Item = RouterOutputs["item"]["bySlug"];
type More = RouterOutputs["catalog"]["moreFromArtist"];

/**
 * Everything under an item's hero. Buying stays in view on the right, beside
 * what you get, the rules and the map (when the item has them) and the details.
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
  return (
    <PageBody wide className="grid gap-8">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(23rem,26rem)] xl:items-start">
        <StickyPanel
          id="buy"
          className="border-fg bg-surface grid scroll-mt-24 content-start gap-4 rounded-[1.6rem] border-[3px] p-5 shadow-[8px_9px_0_0_var(--color-primary)] sm:p-6 xl:sticky xl:col-start-2 xl:row-start-1 xl:self-start"
        >
          {item.access && !item.access.ok && (
            <AccessNotice access={item.access} artist={item.artist} />
          )}
          {item.ownedQuantity === 0 && <UnlockNotice pieces={item.lockedContent} />}
          <ItemPurchase
            itemTitle={item.title}
            listings={item.listings}
            nft={item.chainType === "CONTRACT_NFT"}
            stacked
          />
        </StickyPanel>

        <div className="grid min-w-0 gap-4 xl:col-start-1 xl:row-start-1">
          <LockedContent
            itemId={item.id}
            pieces={item.lockedContent}
            owned={item.ownedQuantity > 0}
            network={item.network}
          />
          <ItemDetails item={item} />
          <ItemActivity sales={item.recentSales} />
        </div>
      </div>

      <MoreFromArtist more={more} artistName={artistName} />
    </PageBody>
  );
}
