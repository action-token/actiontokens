"use client";

import { PackageOpen } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

import { Button } from "@bandcoin/ui/components/button";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { EmptyState } from "@bandcoin/ui/patterns/empty-state";
import { FilterChips, Toolbar } from "@bandcoin/ui/patterns/toolbar";

import { api, type RouterInputs } from "~/trpc/react";

import { ItemCard } from "../catalog/item-card";

type Browse = RouterInputs["catalog"]["browse"];
type TypeFilter = NonNullable<Browse["type"]> | "ALL" | "LOCKED";
type Sort = NonNullable<Browse["sort"]>;

const TYPES: { value: TypeFilter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "TRACK", label: "Music" },
  { value: "IMAGE", label: "Artwork" },
  { value: "VIDEO", label: "Video" },
  { value: "TICKET", label: "Tickets" },
  { value: "FAN_TOKEN", label: "Fan tokens" },
  { value: "MERCH", label: "Merch" },
  { value: "ROYALTY", label: "Royalties" },
  { value: "LOCKED", label: "Locked content" },
];
const SORTS: { value: Sort; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "popular", label: "Most played" },
  { value: "title", label: "A–Z" },
];

/** Everything for sale. Filters live in the URL, so a filtered view can be shared. */
export function MarketplaceView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const type = (params.get("type") ?? "ALL") as TypeFilter;
  const sort = (params.get("sort") ?? "newest") as Sort;
  const search = params.get("search") ?? "";

  const setParam = useCallback(
    (key: string, value: string, fallback: string) => {
      const next = new URLSearchParams(params.toString());
      if (value && value !== fallback) next.set(key, value);
      else next.delete(key);
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const browse = api.catalog.browse.useInfiniteQuery(
    {
      type: type === "ALL" || type === "LOCKED" ? undefined : type,
      locked: type === "LOCKED" || undefined,
      sort,
      search: search || undefined,
    },
    { getNextPageParam: (page) => page.nextCursor },
  );
  const items = browse.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="grid gap-6">
      <Toolbar>
        <label className="text-fg-muted flex items-center gap-2 text-sm sm:ml-auto">
          Sort
          <select
            value={sort}
            onChange={(event) => setParam("sort", event.target.value, "newest")}
            className="bg-surface text-fg h-9 rounded-full border px-3 text-sm font-medium"
          >
            {SORTS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </Toolbar>
      <FilterChips
        label="Type"
        value={type}
        onChange={(value) => setParam("type", value, "ALL")}
        options={TYPES}
      />

      {browse.isPending ? (
        <Grid>
          {Array.from({ length: 10 }, (_, index) => (
            <div key={index} className="grid gap-2">
              <Skeleton className="aspect-square w-full rounded-md" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </Grid>
      ) : items.length === 0 ? (
        <EmptyState
          icon={PackageOpen}
          title={search ? `Nothing matches "${search}"` : "Nothing for sale here yet"}
          description="Try another type, or clear the search."
        />
      ) : (
        <>
          <Grid>
            {items.map((item) => (
              <ItemCard key={item.id} item={item} queue={items} />
            ))}
          </Grid>
          {browse.hasNextPage && (
            <Button
              variant="secondary"
              className="justify-self-center"
              disabled={browse.isFetchingNextPage}
              onClick={() => void browse.fetchNextPage()}
            >
              {browse.isFetchingNextPage ? "Loading…" : "Load more"}
            </Button>
          )}
        </>
      )}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
      {children}
    </div>
  );
}
