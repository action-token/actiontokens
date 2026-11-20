"use client";

import { LayoutGrid, List, ListMusic, Music, Search, SlidersHorizontal, X } from "lucide-react";
import { useSession } from "next-auth/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@actiontokens/ui/components/button";
import { Skeleton } from "@actiontokens/ui/components/skeleton";
import { usePersistedFlag } from "@actiontokens/ui/lib/sidebar-collapsed";
import { cn } from "@actiontokens/ui/lib/cn";
import { EmptyState } from "@actiontokens/ui/patterns/empty-state";
import { ErrorState } from "@actiontokens/ui/patterns/error-state";
import { FilterChips } from "@actiontokens/ui/patterns/toolbar";

import { api, type RouterInputs } from "~/trpc/react";

import { ItemCard } from "../catalog/item-card";
import { TrackList } from "../music/track-list";

type Browse = RouterInputs["music"]["browse"];
type Sort = NonNullable<Browse["sort"]>;
type Show = NonNullable<Browse["show"]>;

const SORTS: { value: Sort; label: string }[] = [
  { value: "trending", label: "Trending" },
  { value: "popular", label: "Most played" },
  { value: "newest", label: "Newest" },
  { value: "title", label: "A–Z" },
  { value: "price_asc", label: "Price ↑" },
  { value: "price_desc", label: "Price ↓" },
];
const DEFAULT_SORT: Sort = "trending";
const PAGE = 30;

const GRID = "grid grid-cols-2 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(176px,1fr))]";

const isSort = (value: string | null): value is Sort =>
  SORTS.some((option) => option.value === value);
const price = (value: string | null) => {
  if (!value) return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
};

/**
 * Every song: search by title or artist; sort (Trending this week by default); All /
 * For sale / Owned / Not owned; a price range; Has stems. Rows or a grid (remembered
 * per browser). Every filter lives in the URL, so a filtered list can be shared.
 */
export function SongsView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { status } = useSession();
  const signedIn = status === "authenticated";

  const search = params.get("q") ?? "";
  const sortParam = params.get("sort");
  const sort: Sort = isSort(sortParam) ? sortParam : DEFAULT_SORT;
  const showParam = (params.get("show") ?? "all") as Show;
  // Owned / Not owned need an account; signed out they read as All.
  const show: Show =
    !signedIn && (showParam === "owned" || showParam === "notOwned") ? "all" : showParam;
  const minPrice = price(params.get("min"));
  const maxPrice = price(params.get("max"));
  const stems = params.get("stems") === "1";
  const [grid, setGrid] = usePersistedFlag("bandcoin.songs-grid", false);

  const setParams = useCallback(
    (changes: Record<string, string | undefined>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const list = api.music.browse.useInfiniteQuery(
    {
      search: search || undefined,
      sort,
      show,
      minPrice,
      maxPrice,
      stems: stems || undefined,
      limit: PAGE,
    },
    { getNextPageParam: (page) => page.nextCursor, enabled: status !== "loading" },
  );
  const tracks = list.data?.pages.flatMap((page) => page.tracks) ?? [];
  const total = list.data?.pages[0]?.total ?? 0;
  const filtered =
    Boolean(search) || show !== "all" || minPrice !== undefined || maxPrice !== undefined || stems;
  const clearFilters = () =>
    setParams({ q: undefined, show: undefined, min: undefined, max: undefined, stems: undefined });

  // Load the next page when the end of the list scrolls into view.
  const end = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = list;
  useEffect(() => {
    const node = end.current;
    if (!node || !hasNextPage) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && !isFetchingNextPage) void fetchNextPage();
      },
      { rootMargin: "400px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const shows: { value: Show; label: string }[] = [
    { value: "all", label: "All" },
    { value: "forSale", label: "For sale" },
    ...(signedIn
      ? [
          { value: "owned" as const, label: "Owned by me" },
          { value: "notOwned" as const, label: "Not owned" },
        ]
      : []),
  ];

  return (
    <div className="grid gap-5">
      {/* One row: search (an icon until opened), show, price, stems, sort, then count and view */}
      <div className="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
        <SearchToggle
          key={search}
          value={search}
          onSearch={(text) => setParams({ q: text || undefined })}
        />
        <FilterChips
          label="Show"
          value={show}
          onChange={(value) => setParams({ show: value === "all" ? undefined : value })}
          options={shows}
          className="mx-0 shrink-0 px-0"
        />
        <PriceRange
          key={`${minPrice ?? ""}-${maxPrice ?? ""}`}
          min={minPrice}
          max={maxPrice}
          onChange={(min, max) =>
            setParams({
              min: min === undefined ? undefined : String(min),
              max: max === undefined ? undefined : String(max),
            })
          }
        />
        <button
          type="button"
          aria-pressed={stems}
          onClick={() => setParams({ stems: stems ? undefined : "1" })}
          title="Only songs with stems: the parts you can remix in the player"
          className={cn(
            "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium whitespace-nowrap transition-colors",
            stems
              ? "border-primary-text bg-primary text-primary-foreground"
              : "bg-card text-muted-foreground hover:text-foreground",
          )}
        >
          <SlidersHorizontal className="size-4" /> Has stems
        </button>
        <select
          aria-label="Sort"
          value={sort}
          onChange={(event) =>
            setParams({
              sort: event.target.value === DEFAULT_SORT ? undefined : event.target.value,
            })
          }
          className="bg-surface text-fg h-9 shrink-0 rounded-full border px-3 text-sm font-medium"
        >
          {SORTS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {filtered && (
          <button
            type="button"
            onClick={clearFilters}
            className="text-fg-muted hover:text-fg inline-flex h-9 shrink-0 items-center gap-1 px-2 text-sm font-semibold whitespace-nowrap"
          >
            <X className="size-4" /> Clear
          </button>
        )}
        <p
          className="text-fg-muted ml-auto shrink-0 pl-2 text-sm whitespace-nowrap"
          aria-live="polite"
        >
          {list.isPending
            ? "Loading…"
            : `${total.toLocaleString("en-US")} ${total === 1 ? "song" : "songs"}`}
        </p>
        <div
          className="bg-surface flex shrink-0 rounded-full border p-0.5"
          role="group"
          aria-label="View"
        >
          <ViewButton active={!grid} onClick={() => setGrid(false)} label="Rows" icon={List} />
          <ViewButton active={grid} onClick={() => setGrid(true)} label="Grid" icon={LayoutGrid} />
        </div>
      </div>

      {list.isPending ? (
        grid ? (
          <div className={GRID} aria-hidden>
            {Array.from({ length: 10 }, (_, index) => (
              <div key={index} className="grid gap-2">
                <Skeleton className="aspect-square w-full rounded-2xl" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-2" aria-hidden>
            {Array.from({ length: 8 }, (_, index) => (
              <Skeleton key={index} className="h-14 w-full" />
            ))}
          </div>
        )
      ) : list.isError ? (
        <ErrorState message="Couldn't load the songs." onRetry={() => void list.refetch()} />
      ) : tracks.length === 0 ? (
        filtered ? (
          <EmptyState
            icon={ListMusic}
            title={search ? `No songs match “${search}”` : "No songs match these filters"}
            description="Try another price, turn a filter off, or clear them all."
            action={
              <Button variant="secondary" onClick={clearFilters}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={Music}
            title="No songs yet"
            description="When artists release music, it shows up here."
          />
        )
      ) : (
        <>
          {grid ? (
            <div className={GRID}>
              {tracks.map((track) => (
                <ItemCard key={track.id} item={track} queue={tracks} />
              ))}
            </div>
          ) : (
            <TrackList tracks={tracks} />
          )}
          <div ref={end} />
          {list.hasNextPage && (
            <Button
              variant="secondary"
              className="justify-self-center"
              disabled={list.isFetchingNextPage}
              onClick={() => void list.fetchNextPage()}
            >
              {list.isFetchingNextPage ? "Loading…" : "Load more"}
            </Button>
          )}
        </>
      )}
    </div>
  );
}

function ViewButton({
  active,
  onClick,
  label,
  icon: Icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: typeof List;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={`Show as ${label.toLowerCase()}`}
      title={label}
      className={cn(
        "grid size-8 place-items-center rounded-full transition-colors",
        active ? "bg-fg text-bg" : "text-fg-muted hover:text-fg",
      )}
    >
      <Icon className="size-4" />
    </button>
  );
}

/** Min and max price in BANDCOIN; applies a moment after typing stops, or on Enter. */
function PriceRange({
  min,
  max,
  onChange,
}: {
  min?: number;
  max?: number;
  onChange: (min?: number, max?: number) => void;
}) {
  const [low, setLow] = useState(min === undefined ? "" : String(min));
  const [high, setHigh] = useState(max === undefined ? "" : String(max));
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const commit = (nextLow: string, nextHigh: string) => {
    const a = price(nextLow);
    const b = price(nextHigh);
    // Typed the wrong way round: swap them.
    if (a !== undefined && b !== undefined && a > b) onChange(b, a);
    else onChange(a, b);
  };
  const later = (nextLow: string, nextHigh: string) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => commit(nextLow, nextHigh), 600);
  };
  const field =
    "bg-transparent h-full w-[4.25rem] min-w-0 px-2 text-sm tabular-nums outline-none placeholder:text-fg-faint";

  return (
    <div
      className="bg-card focus-within:border-primary-text inline-flex h-9 items-center rounded-full border pl-3 text-sm"
      role="group"
      aria-label="Price in BANDCOIN"
    >
      <span className="text-muted-foreground font-medium">Price</span>
      <input
        inputMode="decimal"
        aria-label="Lowest price"
        placeholder="Min"
        value={low}
        onChange={(event) => {
          setLow(event.target.value);
          later(event.target.value, high);
        }}
        onKeyDown={(event) => event.key === "Enter" && commit(low, high)}
        className={field}
      />
      <span className="text-fg-faint" aria-hidden>
        –
      </span>
      <input
        inputMode="decimal"
        aria-label="Highest price"
        placeholder="Max"
        value={high}
        onChange={(event) => {
          setHigh(event.target.value);
          later(low, event.target.value);
        }}
        onKeyDown={(event) => event.key === "Enter" && commit(low, high)}
        className={field}
      />
    </div>
  );
}

/**
 * Search starts as an icon. Click it and the box slides open in the same row; it stays
 * open while there's a search, and folds back (when empty) on Escape or when you leave it.
 */
function SearchToggle({ value, onSearch }: { value: string; onSearch: (text: string) => void }) {
  const [open, setOpen] = useState(value !== "");
  const [text, setText] = useState(value);
  const input = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const change = (next: string) => {
    setText(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => onSearch(next.trim()), 400);
  };
  const close = () => {
    if (text.trim() !== "") return;
    setOpen(false);
  };

  return (
    <div
      className={cn(
        "bg-card flex h-9 shrink-0 items-center overflow-hidden rounded-full border transition-[width,border-color] duration-300 ease-out",
        open ? "focus-within:border-primary-text w-48 sm:w-56" : "w-9",
      )}
    >
      <button
        type="button"
        aria-label={open ? "Search songs" : "Open search"}
        aria-expanded={open}
        onClick={() => {
          setOpen(true);
          // After the box starts opening, so the focus isn't lost to the width change.
          requestAnimationFrame(() => input.current?.focus());
        }}
        className="text-fg-muted hover:text-fg grid size-9 shrink-0 place-items-center"
      >
        <Search className="size-4" />
      </button>
      <input
        ref={input}
        type="search"
        aria-label="Search songs or artists"
        placeholder="Search songs or artists"
        tabIndex={open ? 0 : -1}
        value={text}
        onChange={(event) => change(event.target.value)}
        onBlur={close}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            clearTimeout(timer.current);
            onSearch(text.trim());
          } else if (event.key === "Escape") {
            setText("");
            clearTimeout(timer.current);
            onSearch("");
            setOpen(false);
          }
        }}
        className={cn(
          "placeholder:text-fg-faint h-full min-w-0 flex-1 bg-transparent pr-3 text-sm transition-opacity duration-300 outline-none",
          open ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
}
