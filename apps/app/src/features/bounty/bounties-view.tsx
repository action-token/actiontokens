"use client";

import { Trophy } from "lucide-react";
import { useSession } from "next-auth/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useRef } from "react";

import { EmptyState } from "@actiontokens/ui/patterns/empty-state";
import { FilterChips, SearchInput, Toolbar } from "@actiontokens/ui/patterns/toolbar";

import { api, type RouterInputs } from "~/trpc/react";

import { BountiesPanel } from "./bounties-panel";
import { BountyCard, BountyCardSkeleton } from "./bounty-card";

type List = RouterInputs["bounty"]["list"];
type Filter = NonNullable<List["filter"]>;
type Sort = NonNullable<List["sort"]>;

const SORTS: { value: Sort; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "prize", label: "Highest prize" },
];

/**
 * Every bounty, as on the old Action Tokens: search, sort (newest or highest
 * prize), All / Not joined / Joined, and an endless grid. Top Bounties and
 * Recent Activity are in the app's right panel (BountiesPanel). Filters live in the URL so a view can be shared.
 */
export function BountiesView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { status } = useSession();
  const filter = (params.get("filter") ?? "all") as Filter;
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
  const onSearch = useCallback((value: string) => setParam("search", value, ""), [setParam]);

  const list = api.bounty.list.useInfiniteQuery(
    { filter, sort, search: search || undefined },
    { getNextPageParam: (page) => page.nextCursor },
  );
  const bounties = list.data?.pages.flatMap((page) => page.items) ?? [];
  const filters: { value: Filter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "not_joined", label: "Not joined" },
    ...(status === "authenticated" ? [{ value: "joined" as const, label: "Joined" }] : []),
  ];

  // Load the next page as the end of the grid scrolls into view.
  const end = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = list;
  useEffect(() => {
    const node = end.current;
    if (!node || !hasNextPage) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting && !isFetchingNextPage) void fetchNextPage();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <div className="grid gap-5">
      <Toolbar>
        <SearchInput
          key={search}
          value={search}
          onSearch={onSearch}
          placeholder="Search bounties…"
        />
        <FilterChips
          label="Show"
          value={filter}
          onChange={(value) => setParam("filter", value, "all")}
          options={filters}
        />
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

      {list.isPending ? (
        <Grid>
          {Array.from({ length: 6 }, (_, index) => (
            <BountyCardSkeleton key={index} />
          ))}
        </Grid>
      ) : bounties.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="No bounties found"
          description="Check back soon for new challenges."
        />
      ) : (
        <Grid>
          {bounties.map((bounty) => (
            <BountyCard key={bounty.id} bounty={bounty} />
          ))}
          {isFetchingNextPage &&
            Array.from({ length: 2 }, (_, index) => <BountyCardSkeleton key={`more-${index}`} />)}
        </Grid>
      )}
      <div ref={end} className="h-px" />

      {/* The right panel is only there on wide screens. */}
      <div className="xl:hidden">
        <BountiesPanel />
      </div>
    </div>
  );
}

function Grid({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-4 sm:grid-cols-[repeat(auto-fill,minmax(19rem,1fr))]">{children}</div>
  );
}
