"use client";

import { ArrowRight, ListMusic, Play, Star } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useState, type ReactNode } from "react";

import { Button } from "@actiontokens/ui/components/button";
import { Skeleton } from "@actiontokens/ui/components/skeleton";
import { EmptyState } from "@actiontokens/ui/patterns/empty-state";
import { MediaCarousel, SectionTitle } from "@actiontokens/ui/patterns/media-carousel";
import { useConnectWalletDialogStore } from "@actiontokens/wallet";

import { api, type RouterInputs } from "~/trpc/react";

import type { ItemCardData } from "../catalog/item-card";
import { usePlayer } from "../player/player-store";
import { AlbumCard } from "../catalog/album-card";
import { TrackRow } from "./track-row";

type Sort = NonNullable<RouterInputs["music"]["tracks"]["sort"]>;
const SORTS: { value: Sort; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "popular", label: "Most played" },
  { value: "title", label: "A–Z" },
];

const ALBUM_WIDTH = "minmax(160px,188px)";

function AlbumSkeletons({ count }: { count: number }) {
  return Array.from({ length: count }, (_, key) => (
    <div key={key} className="grid content-start gap-2" aria-hidden>
      <Skeleton className="aspect-square w-full rounded-2xl" />
      <Skeleton className="h-3.5 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  ));
}

/** Full releases, for Home: 12 at a time, more as you scroll to the end. */
export function AlbumsCarousel({ action }: { action?: ReactNode }) {
  const albums = api.music.albums.useInfiniteQuery(
    { limit: 12 },
    { getNextPageParam: (page) => page.nextCursor },
  );
  const list = albums.data?.pages.flatMap((page) => page.albums) ?? [];
  if (albums.isSuccess && list.length === 0) return null;
  return (
    <MediaCarousel
      title="Albums"
      note="full releases"
      action={action}
      itemWidth={ALBUM_WIDTH}
      onEndReached={() => {
        if (albums.hasNextPage && !albums.isFetchingNextPage) void albums.fetchNextPage();
      }}
    >
      {list.map((album) => (
        <AlbumCard key={album.slug} album={{ ...album, artistName: album.organization?.name }} />
      ))}
      {(albums.isPending || albums.isFetchingNextPage) && (
        <AlbumSkeletons count={albums.isPending ? 6 : 3} />
      )}
    </MediaCarousel>
  );
}

/** Every album, newest first, in a grid with Load more: the Albums page. */
export function AlbumsGrid() {
  const albums = api.music.albums.useInfiniteQuery(
    {},
    { getNextPageParam: (page) => page.nextCursor },
  );
  const list = albums.data?.pages.flatMap((page) => page.albums) ?? [];
  if (albums.isSuccess && list.length === 0) {
    return (
      <EmptyState
        icon={ListMusic}
        title="No albums yet"
        description="When organizations put out full releases, they show up here."
      />
    );
  }
  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4">
        {list.map((album) => (
          <AlbumCard key={album.slug} album={{ ...album, artistName: album.organization?.name }} />
        ))}
        {albums.isPending && <AlbumSkeletons count={12} />}
      </div>
      {albums.hasNextPage && (
        <Button
          variant="secondary"
          className="justify-self-center"
          disabled={albums.isFetchingNextPage}
          onClick={() => void albums.fetchNextPage()}
        >
          {albums.isFetchingNextPage ? "Loading…" : "Load more"}
        </Button>
      )}
    </div>
  );
}

/** Every song on Action Tokens, sortable, with Play all: the bottom of Home. No songs: no section. */
export function AllSongs({ seeAllHref }: { seeAllHref?: string }) {
  const [sort, setSort] = useState<Sort>("newest");
  const tracks = api.music.tracks.useInfiniteQuery(
    { sort },
    { getNextPageParam: (page) => page.nextCursor },
  );
  const list = tracks.data?.pages.flatMap((page) => page.tracks) ?? [];
  const playQueue = usePlayer((state) => state.playQueue);
  if (tracks.isSuccess && list.length === 0) return null;

  return (
    <>
      <section id="all-songs" className="grid scroll-mt-24 gap-3" aria-label="All songs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionTitle title="All songs" note="tap a row to listen" />
          <div className="flex items-center gap-2">
            <SortSelect value={sort} onChange={setSort} />
            <Button size="sm" disabled={list.length === 0} onClick={() => playQueue(list)}>
              <Play className="fill-current" /> Play all
            </Button>
          </div>
        </div>
        <TrackList tracks={list} loading={tracks.isPending} />
        <div className="flex flex-wrap items-center justify-center gap-3">
          {tracks.hasNextPage && (
            <Button
              variant="secondary"
              disabled={tracks.isFetchingNextPage}
              onClick={() => void tracks.fetchNextPage()}
            >
              {tracks.isFetchingNextPage ? "Loading…" : "Load more"}
            </Button>
          )}
          {seeAllHref && (
            <Link
              href={seeAllHref}
              className="hover:border-border-strong inline-flex h-9 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition-colors"
            >
              See all songs <ArrowRight className="size-4" />
            </Link>
          )}
        </div>
      </section>
    </>
  );
}

/** Songs you made or own, in full, with Play all: the Songs tab of My collection. */
export function YourSongs() {
  const { status } = useSession();
  const openSignIn = useConnectWalletDialogStore((state) => state.setIsOpen);
  const [sort, setSort] = useState<Sort>("newest");
  const mine = api.music.mine.useQuery({ sort }, { enabled: status === "authenticated" });
  const playQueue = usePlayer((state) => state.playQueue);

  if (status === "unauthenticated") {
    return (
      <EmptyState
        icon={ListMusic}
        title="Sign in to see your music"
        description="Songs you've made and songs you own show up here, in full."
        action={<Button onClick={() => openSignIn(true)}>Sign in</Button>}
      />
    );
  }
  const tracks = mine.data ?? [];
  if (mine.isSuccess && tracks.length === 0) {
    return (
      <EmptyState
        icon={ListMusic}
        title="No songs yet"
        description="Songs you buy, receive or make land here, and play in full."
      />
    );
  }
  return (
    <section className="grid gap-3" aria-label="Your songs">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button disabled={tracks.length === 0} onClick={() => playQueue(tracks)}>
          <Play className="fill-current" /> Play all
        </Button>
        <SortSelect value={sort} onChange={setSort} />
      </div>
      <TrackList
        tracks={tracks}
        loading={mine.isPending}
        badgeOf={(track) =>
          (track as (typeof tracks)[number]).source === "created" ? "Yours" : "Owned"
        }
      />
    </section>
  );
}

/** Songs you starred: private, any song (owned or not), with Play all. */
export function FavoriteSongs() {
  const { status } = useSession();
  const openSignIn = useConnectWalletDialogStore((state) => state.setIsOpen);
  const favorites = api.collection.favorites.useQuery(undefined, {
    enabled: status === "authenticated",
  });
  const playQueue = usePlayer((state) => state.playQueue);

  if (status === "unauthenticated") {
    return (
      <EmptyState
        icon={Star}
        title="Sign in to see your favourites"
        description="Star a song anywhere and it lands here."
        action={<Button onClick={() => openSignIn(true)}>Sign in</Button>}
      />
    );
  }
  const tracks = favorites.data ?? [];
  if (favorites.isSuccess && tracks.length === 0) {
    return (
      <EmptyState
        icon={Star}
        title="No favourites yet"
        description="Tap the star on any song and it shows up here. Only you can see this list."
      />
    );
  }
  return (
    <section className="grid gap-3" aria-label="Favourites">
      <Button
        className="justify-self-start"
        disabled={tracks.length === 0}
        onClick={() => playQueue(tracks)}
      >
        <Play className="fill-current" /> Play all
      </Button>
      <TrackList tracks={tracks} loading={favorites.isPending} />
    </section>
  );
}

function TrackList({
  tracks,
  loading,
  badgeOf,
}: {
  tracks: ItemCardData[];
  loading: boolean;
  badgeOf?: (track: ItemCardData) => string;
}) {
  if (loading) {
    return (
      <div className="grid gap-2">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-14 w-full" />
        ))}
      </div>
    );
  }
  return (
    <ol className="@container grid gap-0.5">
      {tracks.map((track, index) => (
        <TrackRow
          key={track.id}
          track={track}
          position={index}
          list={tracks}
          badge={badgeOf?.(track)}
        />
      ))}
    </ol>
  );
}

function SortSelect({ value, onChange }: { value: Sort; onChange: (sort: Sort) => void }) {
  return (
    <label className="text-fg-muted flex items-center gap-2 text-sm">
      Sort
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as Sort)}
        className="bg-surface text-fg h-9 rounded-full border px-3 text-sm font-medium"
      >
        {SORTS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
