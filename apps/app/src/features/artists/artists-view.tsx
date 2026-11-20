"use client";

import { Users } from "lucide-react";
import { useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@actiontokens/ui/components/button";
import { Skeleton } from "@actiontokens/ui/components/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@actiontokens/ui/components/tabs";
import { EmptyState } from "@actiontokens/ui/patterns/empty-state";
import { ErrorState } from "@actiontokens/ui/patterns/error-state";
import { SearchInput, Toolbar } from "@actiontokens/ui/patterns/toolbar";

import { api, type RouterOutputs } from "~/trpc/react";

import { FollowSubscribe } from "../artist/follow-subscribe";
import { ArtistCircle } from "./artist-circle";
import { HERO_COUNT } from "./artists-hero";

type View = "popular" | "newest" | "following";
type Artist = RouterOutputs["artist"]["directory"]["artists"][number];

const GRID = "grid grid-cols-2 gap-x-2 gap-y-4 sm:grid-cols-[repeat(auto-fill,minmax(184px,1fr))]";

const tokenOf = (artist: Artist) =>
  artist.tokenCode ? { code: artist.tokenCode, artistId: artist.id } : null;

/** A follower count that moves when you follow, unfollow or subscribe. */
function useFollowers(initial: number) {
  const [followers, setFollowers] = useState(initial);
  return {
    followers,
    onFollowers: setFollowers,
    onJoined: () => setFollowers((count) => count + 1),
  };
}

/**
 * Every artist as a circle with Play, Follow and Subscribe. Search by name; most
 * followed, newest, or the ones you follow. More load as you scroll. On plain Most
 * followed the top three are left out: they're the hero above.
 */
export function ArtistsView() {
  const { status } = useSession();
  const signedIn = status === "authenticated";
  const [search, setSearch] = useState("");
  const [picked, setView] = useState<View>("popular");
  // Signing out while on Following falls back to Most followed.
  const view = picked === "following" && !signedIn ? "popular" : picked;
  const list = api.artist.directory.useInfiniteQuery(
    {
      search: search || undefined,
      sort: view === "newest" ? "newest" : "popular",
      following: view === "following" || undefined,
      limit: 36,
    },
    { getNextPageParam: (page) => page.next },
  );
  const artists = list.data?.pages.flatMap((page) => page.artists) ?? [];
  const rest = view === "popular" && !search ? artists.slice(HERO_COUNT) : artists;

  // Load the next page when the end of the grid scrolls into view.
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

  return (
    <div className="grid gap-6">
      <Toolbar className="sm:justify-between">
        <SearchInput placeholder="Search artists" onSearch={setSearch} className="sm:w-80" />
        <Tabs value={view} onValueChange={(next) => setView(next as View)}>
          <TabsList>
            <TabsTrigger value="popular">Most followed</TabsTrigger>
            <TabsTrigger value="newest">Newest</TabsTrigger>
            {signedIn && <TabsTrigger value="following">Following</TabsTrigger>}
          </TabsList>
        </Tabs>
      </Toolbar>

      {list.isPending ? (
        <div aria-hidden>
          <div className={GRID}>
            {Array.from({ length: 12 }, (_, key) => (
              <div key={key} className="grid justify-items-center gap-2 p-2.5">
                <Skeleton className="aspect-square w-full rounded-full" />
                <Skeleton className="mt-1.5 h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="mt-1 h-8 w-full rounded-full" />
                <Skeleton className="h-8 w-full rounded-full" />
              </div>
            ))}
          </div>
        </div>
      ) : list.isError ? (
        <ErrorState message="Couldn't load the artists." onRetry={() => void list.refetch()} />
      ) : artists.length === 0 ? (
        view === "following" && !search ? (
          <EmptyState
            icon={Users}
            title="You're not following anyone yet"
            description="Follow artists to see their drops, posts and stories first."
            action={
              <Button variant="secondary" onClick={() => setView("popular")}>
                Find artists
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={Users}
            title="No artists found"
            description={search ? `Nobody called “${search}”.` : "Artists will show up here."}
          />
        )
      ) : (
        <>
          {rest.length > 0 && (
            <div className={GRID} aria-label="Artists">
              {rest.map((artist) => (
                <DirectoryArtist key={artist.slug} artist={artist} />
              ))}
            </div>
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

/** A circle with Follow and Subscribe under it. */
function DirectoryArtist({ artist }: { artist: Artist }) {
  const { followers, onFollowers, onJoined } = useFollowers(artist.followers);
  return (
    <ArtistCircle
      artist={{ ...artist, followers }}
      actions={
        <FollowSubscribe
          slug={artist.slug}
          initialFollowing={artist.following}
          initialSubscribed={artist.subscribed}
          token={tokenOf(artist)}
          onFollowers={onFollowers}
          onJoined={onJoined}
        />
      }
    />
  );
}
