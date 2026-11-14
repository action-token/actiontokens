"use client";

import { Search, X } from "lucide-react";
import { useDeferredValue, useState } from "react";

import { MarketCard } from "~/components/market/MarketCard";
import { AppShell, ScreenHeader } from "~/components/shell/AppShell";
import { ArButton } from "~/components/ui/ArButton";
import { Skeleton } from "~/components/ui/Skeleton";
import { browseFilter, MARKET_TYPES, marketplaceUrl, type MarketTypeId } from "~/lib/market";
import { cn } from "@bandcoin/ui/lib/cn";
import { api } from "~/trpc/react";

/**
 * ── /marketplace ───────────────────────────────────────────────────────────
 *
 * Everything for sale, to browse from AR: searchable, filtered by type, newest first. Read-only
 * here: every card's "Go to Marketplace" opens the item in the fan app, which has the wallet and
 * checkout.
 */
export default function MarketplaceScreen() {
  const [type, setType] = useState<MarketTypeId>("ALL");
  const [query, setQuery] = useState("");
  // Typing shouldn't fire a request per keystroke.
  const search = useDeferredValue(query.trim()) || undefined;

  const browse = api.catalog.browse.useInfiniteQuery(
    { ...browseFilter(type), search, sort: "newest" },
    { getNextPageParam: (page) => page.nextCursor, staleTime: 60_000 },
  );
  const items = browse.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <AppShell>
      <div className="flex h-full flex-col">
        <ScreenHeader eyebrow="Buy & collect" title="Marketplace" />

        <div className="px-5">
          <div className="ar-bevel rounded-ar flex h-11 items-center gap-2.5 px-3.5">
            <Search size={15} strokeWidth={2.2} className="text-ar-faint shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value.slice(0, 80))}
              placeholder="Search items or artists"
              aria-label="Search the marketplace"
              className="text-ar-text placeholder:text-ar-faint min-w-0 flex-1 bg-transparent text-[13px] outline-hidden"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="text-ar-faint hover:text-ar-text shrink-0"
              >
                <X size={15} strokeWidth={2.4} />
              </button>
            )}
          </div>
        </div>

        <div
          role="tablist"
          aria-label="Item type"
          className="mt-3 flex [scrollbar-width:none] gap-2 overflow-x-auto px-5 [&::-webkit-scrollbar]:hidden"
        >
          {MARKET_TYPES.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={type === t.id}
              onClick={() => setType(t.id)}
              className={cn(
                "font-hud h-8 shrink-0 rounded-full border px-3.5 text-[10.5px] font-semibold tracking-[0.1em] uppercase transition-colors",
                type === t.id
                  ? "bg-ar-accent/15 border-ar-accent/40 text-ar-text"
                  : "border-ar-line text-ar-faint hover:text-ar-dim",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="ar-scroll mt-3.5 flex-1 px-5 pb-6">
          <div className="grid grid-cols-2 gap-3">
            {browse.isPending &&
              Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="aspect-[3/4] w-full" rounded="rounded-ar" />
              ))}
            {items.map((item) => (
              <MarketCard key={item.id} item={item} />
            ))}
          </div>

          {browse.isError && (
            <div className="py-16 text-center">
              <p className="font-hud text-ar-dim text-[13px] font-bold tracking-[0.14em] uppercase">
                Couldn&apos;t load the marketplace
              </p>
              <ArButton size="sm" className="mt-3" onClick={() => void browse.refetch()}>
                Try again
              </ArButton>
            </div>
          )}

          {!browse.isPending && !browse.isError && items.length === 0 && (
            <div className="py-16 text-center">
              <p className="font-hud text-ar-dim text-[13px] font-bold tracking-[0.14em] uppercase">
                Nothing here yet
              </p>
              <p className="text-ar-faint mx-auto mt-1.5 max-w-[16rem] text-[12.5px] leading-relaxed">
                {search
                  ? "Nothing matches that search."
                  : "Try another type, or check back soon for new drops."}
              </p>
            </div>
          )}

          {browse.hasNextPage && (
            <ArButton
              block
              variant="outline"
              className="mt-4"
              busy={browse.isFetchingNextPage}
              onClick={() => void browse.fetchNextPage()}
            >
              Load more
            </ArButton>
          )}

          {items.length > 0 && (
            <a
              href={marketplaceUrl}
              className="font-hud text-ar-green mt-5 block text-center text-[11px] font-semibold tracking-[0.14em] uppercase hover:underline"
            >
              Open the full marketplace →
            </a>
          )}
        </div>
      </div>
    </AppShell>
  );
}
