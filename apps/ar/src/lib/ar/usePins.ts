import { keepPreviousData } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { api } from "~/trpc/react";
import { distanceMeters } from "@bandcoin/ar-core/ar/geo";
import { pinStatus } from "@bandcoin/ar-core/ar/rarity";
import { useSettings } from "./store";
import type { ArArtist, ArPin, GeoFix, Rarity } from "@bandcoin/ar-core/ar/types";

/**
 * ── Pin state ──────────────────────────────────────────────────────────────
 *
 * Pins come from `api.pin.list`, which resolves privacy, tier eligibility and
 * multi-spot collection rules server-side. Every approved drop is returned
 * to every viewer; the ones they can't take arrive `locked` with a reason.
 *
 * Collects go through `api.pin.collect`, which writes a `PinClaim` and hands
 * back the redeem code. The mutation patches the `pin.list`
 * cache directly on success rather than refetching, so a capture shows up
 * instantly on the map, the AR view and the collection screen at once.
 */

/** Artists, with real follow state for the signed-in viewer. */
export function useArtistsQuery() {
  const query = api.artist.list.useQuery(undefined, {
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });
  return { ...query, artists: query.data ?? EMPTY_ARTISTS };
}

export function useArtists(): ArArtist[] {
  return useArtistsQuery().artists;
}

/**
 * Follow / unfollow. Free, one call, as in the fan app. Pins are refetched
 * too, because following unlocks the artist's follower pins.
 */
export function useToggleFollow() {
  const utils = api.useUtils();
  const [error, setError] = useState<string | null>(null);
  const setFollowing = api.artist.setFollowing.useMutation({
    onMutate: () => setError(null),
    onError: (e) => setError(e.message),
    onSettled: () => Promise.all([utils.artist.list.invalidate(), utils.artist.byId.invalidate(), utils.pin.list.invalidate()]),
  });
  const pendingId = setFollowing.isPending ? (setFollowing.variables?.artistId ?? null) : null;

  return {
    error,
    pendingId,
    labelFor: (artist: Pick<ArArtist, "id" | "followed">) =>
      pendingId === artist.id ? (artist.followed ? "Unfollowing" : "Following…") : artist.followed ? "Following" : "Follow",
    toggle: (artist: Pick<ArArtist, "id" | "followed">) => {
      if (pendingId) return;
      setFollowing.mutate({ artistId: artist.id, following: !artist.followed });
    },
  };
}

const EMPTY_ARTISTS: ArArtist[] = [];

/**
 * Claim a pin for real.
 *
 * The server decides everything that matters — range, eligibility, whether the
 * drop still has stock — so this deliberately doesn't pre-judge any of it
 * beyond passing the current fix. Failures come back as readable messages
 * ("You're 210 m away…", "Follow Luna Vale to unlock") meant to be shown
 * verbatim.
 */
export function useCollectPin() {
  const utils = api.useUtils();

  return api.pin.collect.useMutation({
    onSuccess: (result, variables) => {
      // Patch in place instead of invalidating: a refetch would drop the whole
      // list mid-celebration, and the server already told us exactly what
      // changed. a single-spot pin collects every sibling at once, but
      // the list query can't know the grouping from here — the next natural
      // refetch reconciles those; this keeps the captured pin correct now.
      utils.pin.list.setData(undefined, (prev) =>
        prev?.map((pin) =>
          pin.id === variables.spotId
            ? {
                ...pin,
                collected: true,
                collectedAt: result.collectedAt,
                redeemCode: result.redeemCode,
                isRedeemed: false,
                remaining: result.remaining,
                locked: false,
                lockReason: null,
              }
            : pin,
        ),
      );
    },
  });
}

/**
 * Claim a pin by its QR code.
 *
 * Separate from `useCollectPin` only because the server's two entry points
 * differ on proof of presence — walking up proves it with GPS, scanning proves
 * it by holding a code that exists in one physical place. Everything after
 * that is identical, including the cache patch, so a code scanned at the
 * counter shows the card as collected on the map and in the binder without a
 * refetch.
 */
export function useCollectPinByQr() {
  const utils = api.useUtils();

  return api.pin.collectByQr.useMutation({
    onSuccess: (result, variables) => {
      utils.pin.list.setData(undefined, (prev) =>
        prev?.map((pin) =>
          pin.id === variables.spotId
            ? {
                ...pin,
                collected: true,
                collectedAt: result.collectedAt,
                redeemCode: result.redeemCode,
                isRedeemed: false,
                remaining: result.remaining,
                locked: false,
                lockReason: null,
              }
            : pin,
        ),
      );
      // The binder is its own query off the viewer's claims, so unlike the
      // patch above it cannot be nudged — it has to go and look again.
      void utils.pin.collected.invalidate();
    },
  });
}

/**
 * The live pin query, for screens that need to tell "still loading" apart from
 * "genuinely nothing here" — an empty map is a real state now, not just a
 * fixture that failed to render.
 */
export function usePinsQuery() {
  const query = api.pin.list.useQuery(undefined, {
    // Collecting is the only thing that changes a pin, and the mutation
    // patches the cache itself — so don't re-fetch the whole drop set on
    // every window focus.
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });

  return { ...query, pins: query.data ?? EMPTY_PINS };
}

/** Stable identity so `pins` isn't a fresh [] on every render while loading. */
const EMPTY_PINS: ArPin[] = [];

export function usePins(): ArPin[] {
  return usePinsQuery().pins;
}

/**
 * The viewer's own cards, paginated on the server.
 *
 * Search, rarity filter and sort are sent to the server rather than applied
 * here, because the client only ever holds one page — filtering a page would
 * filter 24 cards instead of the collection. `keepPreviousData` holds the
 * current grid on screen while a changed filter is in flight, so typing in the
 * search box doesn't strobe the page empty between keystrokes.
 */
export function useCollectedPinsQuery(args: {
  enabled: boolean;
  rarity: Rarity | "all";
  query: string;
  sort: "newest" | "rarest" | "artist";
  pageSize?: number;
}) {
  const query = api.pin.collected.useInfiniteQuery(
    {
      limit: args.pageSize ?? 24,
      rarity: args.rarity,
      query: args.query,
      sort: args.sort,
    },
    {
      enabled: args.enabled,
      getNextPageParam: (last) => last.nextCursor,
      refetchOnWindowFocus: false,
      staleTime: 60_000,
      placeholderData: keepPreviousData,
    },
  );

  const pins = useMemo(() => query.data?.pages.flatMap((p) => p.pins) ?? EMPTY_PINS, [query.data]);

  const last = query.data?.pages.at(-1);
  return {
    ...query,
    pins,
    /** Matching the active filter — what pagination counts against. */
    total: last?.total ?? 0,
    /** The whole collection, unfiltered — drives the header stats and chips. */
    facets: last?.facets,
  };
}

/**
 * One artist's pins, paginated on the server.
 *
 * Deliberately not a client-side filter over `usePins()`. An artist page asks a
 * narrow question ("what does *this* artist have out") — and answering it from
 * the global pin list means downloading every drop on the map to throw nearly
 * all of them away. One busy artist can have a hundred live pins, and a page
 * that mounts all of them is what exhausted iOS Safari's GPU budget and killed
 * the tab.
 *
 * Pages accumulate rather than replace: "Show more" should extend the grid, not
 * swap it, so `keepPreviousData` holds the current page on screen while the
 * next one is in flight instead of flashing the empty state.
 */
export function useArtistPinsQuery(args: {
  artistId: string | null;
  tab: "live" | "yours";
  pageSize?: number;
}) {
  const query = api.pin.byArtist.useInfiniteQuery(
    {
      artistId: args.artistId ?? "",
      tab: args.tab,
      limit: args.pageSize ?? 24,
    },
    {
      enabled: Boolean(args.artistId),
      getNextPageParam: (last) => last.nextCursor,
      refetchOnWindowFocus: false,
      staleTime: 60_000,
    },
  );

  const pins = useMemo(() => query.data?.pages.flatMap((p) => p.pins) ?? EMPTY_PINS, [query.data]);

  return {
    ...query,
    pins,
    // Every page carries the same total, so the newest one is as good as any —
    // and it's the freshest read of a number that can move while you page.
    total: query.data?.pages.at(-1)?.total ?? 0,
  };
}

/**
 * Pins for the two *discovery* surfaces — the map and the AR scene — with the
 * "Following only" preference applied.
 *
 * Deliberately a separate hook rather than a filter inside `usePinsQuery`,
 * because that setting is about what you're being *shown while looking for
 * something new*, not about what exists. Folding it into the base query would
 * quietly break four other screens that legitimately need the unfiltered set:
 *
 *   - the binder (`/collection`) and the profile's stats — cards you already
 *     own are yours whether or not you still follow the artist, and having them
 *     vanish from your own collection would read as data loss;
 *   - a single card's detail page, reachable directly by URL;
 *   - `/directions/[id]`, where the whole page is about one specific pin —
 *     filtering it out would blank the screen you just navigated to;
 *   - `/artists/[id]`, where you're explicitly looking at one artist's pins, so
 *     hiding them for not following that artist is self-contradictory.
 *
 * Map and AR share this hook so they can't disagree about which drops are
 * real; an AR pin with no matching map pin would read as a bug, not a filter.
 *
 * Falls open while artists are still loading: an empty `artists` array would
 * otherwise mean "follow nothing", blanking the map on every cold load.
 */
/**
 * Exactly what the discovery screens consume — no more.
 *
 * Declared explicitly rather than inferred from a `{ ...query }` spread. A
 * tRPC query result carries a very large generic type, and re-exporting it
 * through a wrapper compounds it: TypeScript can hit its instantiation limit
 * while expanding it and silently fall back to `any`, at which point every
 * type-aware lint rule downstream starts reporting "unsafe assignment" on
 * values that are in fact well typed. Naming the three fields the callers
 * actually use keeps the type small, keeps those callers honest about their
 * surface, and removes the failure mode entirely.
 */
export interface DiscoveryPinsResult {
  pins: ArPin[];
  isLoading: boolean;
  isError: boolean;
  /** Re-run the underlying query. Callers only ever fire-and-forget it. */
  refetch: () => Promise<unknown>;
}

export function useDiscoveryPinsQuery(): DiscoveryPinsResult {
  const { pins, isLoading, isError, refetch } = usePinsQuery();
  const followingOnly = useSettings((s) => s.followingOnly);
  const { artists, isLoading: artistsLoading } = useArtistsQuery();

  const discovered = useMemo(() => {
    if (!followingOnly || artistsLoading) return pins;
    const followed = new Set(artists.filter((a) => a.followed).map((a) => a.id));
    return pins.filter((p) => followed.has(p.artistId));
  }, [pins, followingOnly, artists, artistsLoading]);

  return { pins: discovered, isLoading, isError, refetch };
}

export function useDiscoveryPins(): ArPin[] {
  return useDiscoveryPinsQuery().pins;
}

export type PinFilterId = "all" | "following" | "available" | "collected";

export const PIN_FILTERS: { id: PinFilterId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "following", label: "Following" },
  { id: "available", label: "Available" },
  { id: "collected", label: "Collected" },
];

export function filterPins(
  pins: ArPin[],
  filter: PinFilterId,
  followedArtistIds: Set<string>,
): ArPin[] {
  switch (filter) {
    case "following":
      return pins.filter((p) => followedArtistIds.has(p.artistId));
    case "available":
      return pins.filter((p) => pinStatus(p) === "collectible");
    case "collected":
      return pins.filter((p) => p.collected);
    default:
      return pins;
  }
}

/** Pins sorted by distance from the current fix, nearest first. */
export function sortByDistance(pins: ArPin[], fix: GeoFix | null) {
  if (!fix) return pins.map((pin) => ({ pin, distance: Number.POSITIVE_INFINITY }));
  return pins
    .map((pin) => ({ pin, distance: distanceMeters(fix, pin) }))
    .sort((a, b) => a.distance - b.distance);
}
