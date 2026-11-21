import { ShoppingBag } from "lucide-react";
import Link from "next/link";

import { cn } from "@actiontokens/ui/lib/cn";

import { formatPrice, formatUsd, marketItemUrl, TOKEN_CODE, TYPE_LABEL } from "~/lib/market";

export type MarketItem = {
  slug: string;
  title: string;
  type: string;
  coverUrl: string | null;
  artistName: string;
  price: { actionToken: string; usd: string } | null;
};

/**
 * One marketplace item: the art, its artist, the price and "Go to Marketplace". AR shows items but
 * sends you to the fan app to buy; the art and name open the item here.
 */
export function MarketCard({ item, className }: { item: MarketItem; className?: string }) {
  const href = `/marketplace/${encodeURIComponent(item.slug)}`;
  const price = item.price ? formatPrice(item.price.actionToken) : null;
  const usd = item.price ? formatUsd(item.price.usd) : null;

  return (
    <div className={cn("ar-bevel rounded-ar flex flex-col overflow-hidden", className)}>
      <Link
        href={href}
        className="group relative block aspect-square overflow-hidden border-b-2 border-[hsl(var(--st-line)/0.85)]"
      >
        {item.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.coverUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <span className="bg-ar-surface-3 block h-full w-full" />
        )}
        <span className="st-paper st-tilt-l font-hud absolute top-2 left-2 rounded-md border-2 px-1.5 py-0.5 text-[10px] leading-none font-semibold tracking-[0.1em] uppercase shadow-[2px_2px_0_0_hsl(var(--st-ink))]">
          {TYPE_LABEL[item.type] ?? item.type}
        </span>
        {!item.price && (
          <span className="st-tilt-r font-hud bg-ar-danger absolute top-2 right-2 rounded-md border-2 border-[hsl(var(--st-ink))] px-1.5 py-0.5 text-[10px] leading-none font-semibold tracking-[0.1em] text-white uppercase">
            Sold out
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col gap-2 p-2.5">
        <Link href={href} className="min-w-0">
          <p className="text-ar-text truncate text-[13px] leading-tight font-semibold">
            {item.title}
          </p>
          <p className="text-ar-faint mt-0.5 truncate text-[11px]">{item.artistName}</p>
        </Link>

        {price && (
          <p className="mt-auto flex items-baseline gap-1.5">
            <span className="font-hud st-green st-tilt-l rounded-md border-2 px-1.5 py-0.5 text-[15px] leading-none font-semibold tabular-nums shadow-[2px_2px_0_0_hsl(var(--st-ink))]">
              {price}
            </span>
            <span className="font-hud text-ar-dim text-[9.5px] font-semibold tracking-[0.12em] uppercase">
              {TOKEN_CODE}
            </span>
            {usd && <span className="text-ar-faint ml-auto text-[10px] tabular-nums">{usd}</span>}
          </p>
        )}

        <a
          href={marketItemUrl(item.slug)}
          className="ar-key ar-key-primary font-hud flex h-8 items-center justify-center gap-1.5 rounded-[10px] text-[10.5px] font-semibold tracking-[0.08em] uppercase"
        >
          <ShoppingBag size={13} strokeWidth={2.4} />
          Go to Marketplace
        </a>
      </div>
    </div>
  );
}
