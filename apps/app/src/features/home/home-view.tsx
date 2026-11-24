"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useState, useSyncExternalStore } from "react";

import { Skeleton } from "@actiontokens/ui/components/skeleton";
import { MediaCarousel } from "@actiontokens/ui/patterns/media-carousel";

import { api, type RouterOutputs } from "~/trpc/react";

import { ItemCard, POSTER_WIDTH } from "../catalog/item-card";
import { AlbumsCarousel, AllSongs } from "../music/music-view";
import { existingListeningSession } from "../player/listening-id";

type Home = RouterOutputs["catalog"]["home"];

/** The listening id never changes under us; nothing to subscribe to. */
const noSubscribe = () => () => undefined;

/** Cards fetched each time a Home carousel nears its end. */
const MORE = 12;

const seeAll = (href: string) => (
  <Link href={href} className="text-fg-muted hover:text-fg text-[13px] font-semibold">
    See all
  </Link>
);

/** The music on the home page (under "Hear it"): recently played, trending, new songs, albums, then every song. */
export function HomeView({ home }: { home: Home }) {
  return (
    <div className="grid gap-9">
      <RecentlyPlayed />
      <TrendingCarousel home={home} />
      <NewSongsCarousel home={home} />
      <AlbumsCarousel action={seeAll("/albums")} />
      <AllSongs seeAllHref="/songs" />
    </div>
  );
}

/** Your last 12 different songs (or this browser's, as a guest). Hidden until there's something to show. */
export function RecentlyPlayed() {
  const { status } = useSession();
  // localStorage only exists in the browser; the server renders without an id.
  const sessionId = useSyncExternalStore(noSubscribe, existingListeningSession, () => undefined);
  const signedIn = status === "authenticated";
  const recent = api.music.recent.useQuery(
    { sessionId: signedIn ? undefined : sessionId },
    { enabled: status !== "loading" && (signedIn || !!sessionId) },
  );
  const items = recent.data ?? [];
  if (items.length === 0) return null;
  return (
    <MediaCarousel
      title="Recently played"
      note="pick up where you left off"
      itemWidth={POSTER_WIDTH}
    >
      {items.map((item) => (
        <ItemCard key={item.id} item={item} queue={items} />
      ))}
    </MediaCarousel>
  );
}

/**
 * Songs played in the last 7 days, most played first. The first 12 come with the page;
 * more load from `music.browse` as you scroll. Nothing played this week: no section.
 */
export function TrendingCarousel({ home }: { home: Home }) {
  const [started, setStarted] = useState(false);
  const more = api.music.browse.useInfiniteQuery(
    { sort: "trending", playedThisWeek: true, limit: MORE },
    {
      initialCursor: home.trendingCursor,
      getNextPageParam: (page) => page.nextCursor,
      enabled: started && home.trendingCursor !== undefined,
    },
  );
  if (home.trending.length === 0) return null;
  const items = [...home.trending, ...(more.data?.pages.flatMap((page) => page.tracks) ?? [])];
  const onEndReached = () => {
    if (home.trendingCursor === undefined || more.isFetching) return;
    if (!started) setStarted(true);
    else if (more.hasNextPage) void more.fetchNextPage();
  };
  return (
    <MediaCarousel
      title="Trending this week"
      note="most played in the last 7 days"
      action={seeAll("/songs?sort=trending")}
      itemWidth={POSTER_WIDTH}
      onEndReached={onEndReached}
    >
      {items.map((item) => (
        <ItemCard key={item.id} item={item} queue={items} />
      ))}
      {more.isFetching && <LoadingCards />}
    </MediaCarousel>
  );
}

/** The first 12 come with the page; more load from `music.tracks` (newest) as you scroll. */
export function NewSongsCarousel({ home }: { home: Home }) {
  const [started, setStarted] = useState(false);
  const more = api.music.tracks.useInfiniteQuery(
    { sort: "newest", limit: MORE },
    {
      initialCursor: home.newMusicCursor,
      getNextPageParam: (page) => page.nextCursor,
      enabled: started && !!home.newMusicCursor,
    },
  );
  if (home.newMusic.length === 0) return null;
  const items = [...home.newMusic, ...(more.data?.pages.flatMap((page) => page.tracks) ?? [])];
  const onEndReached = () => {
    if (!home.newMusicCursor || more.isFetching) return;
    if (!started) setStarted(true);
    else if (more.hasNextPage) void more.fetchNextPage();
  };
  return (
    <MediaCarousel
      title="New songs"
      note="fresh off the press"
      action={seeAll("/songs?sort=newest")}
      itemWidth={POSTER_WIDTH}
      onEndReached={onEndReached}
    >
      {items.map((item) => (
        <ItemCard key={item.id} item={item} queue={items} />
      ))}
      {more.isFetching && <LoadingCards />}
    </MediaCarousel>
  );
}

function LoadingCards() {
  return [0, 1, 2].map((key) => (
    <div key={key} className="grid content-start gap-2" aria-hidden>
      <Skeleton className="aspect-square w-full rounded-2xl" />
      <Skeleton className="h-3.5 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  ));
}
