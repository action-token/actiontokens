"use client";

import { ShoppingBag } from "lucide-react";

import { AppShell, ScreenHeader } from "~/components/shell/AppShell";
import { Skeleton, SkeletonText } from "~/components/ui/Skeleton";
import { formatPrice, formatUsd, marketItemUrl, TYPE_LABEL } from "~/lib/market";
import { useQueryParams } from "~/lib/navigation";
import { api } from "~/trpc/react";

/**
 * ── /marketplace/[slug] ─────────────────────────────────────────────────────
 *
 * One item, to look at from AR: the art, who made it, what's left and the cheapest price. Buying
 * (wallet, checkout, gated content) is the fan app's, reached by the one button.
 */
export default function MarketItemScreen() {
  const { query } = useQueryParams();
  const slug = typeof query.slug === "string" ? query.slug : "";
  const item = api.item.bySlug.useQuery({ slug }, { enabled: slug !== "", retry: false });
  const data = item.data;

  const open = data?.listings[0];
  const copies =
    data?.supply != null
      ? `${data.sold} of ${data.supply} sold`
      : data
        ? `${data.sold} sold`
        : null;
  const usd = open ? formatUsd(open.priceUsd) : null;

  return (
    <AppShell>
      <div className="flex h-full flex-col">
        <ScreenHeader back eyebrow="Marketplace" title={data?.title ?? "Item"} />

        <div className="ar-scroll flex-1 px-5 pb-6">
          {item.isPending && (
            <>
              <Skeleton className="aspect-square w-full" rounded="rounded-ar" />
              <SkeletonText lines={3} className="mt-4" />
            </>
          )}

          {item.isError && (
            <p className="font-hud text-ar-dim py-16 text-center text-[13px] font-bold tracking-[0.14em] uppercase">
              This item isn&apos;t available
            </p>
          )}

          {data && (
            <>
              <div className="ar-bevel rounded-ar overflow-hidden">
                {data.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={data.coverUrl} alt="" className="aspect-square w-full object-cover" />
                ) : (
                  <div className="bg-ar-surface-3 aspect-square w-full" />
                )}
              </div>

              <p className="font-hud text-ar-accent mt-4 text-[10px] font-semibold tracking-[0.28em] uppercase">
                {TYPE_LABEL[data.type] ?? data.type}
              </p>
              <h2 className="font-hud text-ar-text mt-1 text-[22px] leading-tight font-bold">
                {data.title}
              </h2>
              <p className="text-ar-faint mt-1 text-[13px]">
                {data.artist?.name ?? data.track?.artistName ?? "Bandcoin"}
              </p>

              <p className="mt-4 flex items-baseline gap-2">
                {open ? (
                  <>
                    <span className="font-hud text-ar-green-hot text-[24px] leading-none font-bold tabular-nums">
                      {formatPrice(open.priceBandcoin)}
                    </span>
                    <span className="font-hud text-ar-dim text-[10px] font-semibold tracking-[0.12em] uppercase">
                      BANDCOIN
                    </span>
                    {usd && <span className="text-ar-faint ml-auto text-[12px]">{usd}</span>}
                  </>
                ) : (
                  <span className="font-hud text-ar-dim text-[13px] font-bold tracking-[0.14em] uppercase">
                    Not for sale right now
                  </span>
                )}
              </p>
              {copies && <p className="text-ar-faint mt-1 text-[12px]">{copies}</p>}

              {data.description && (
                <p className="text-ar-dim mt-4 text-[13px] leading-relaxed whitespace-pre-line">
                  {data.description}
                </p>
              )}

              <a
                href={marketItemUrl(data.slug)}
                className="ar-key ar-key-primary font-hud mt-5 flex h-11 items-center justify-center gap-2 rounded-[12px] text-[12px] font-semibold tracking-[0.08em] uppercase"
              >
                <ShoppingBag size={15} strokeWidth={2.4} />
                Go to Marketplace
              </a>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
