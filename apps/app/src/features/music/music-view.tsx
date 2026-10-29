"use client";

import { ListMusic, Play } from "lucide-react";
import { useSession } from "next-auth/react";
import { useState } from "react";

import { Button } from "@bandcoin/ui/components/button";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { EmptyState } from "@bandcoin/ui/patterns/empty-state";
import { MediaCarousel, SectionTitle } from "@bandcoin/ui/patterns/media-carousel";
import { useConnectWalletDialogStore } from "@bandcoin/wallet";

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

/** Full releases, for Home. */
export function AlbumsCarousel() {
  const overview = api.music.overview.useQuery();
  if (!overview.data || overview.data.albums.length === 0) return null;
  return (
    <MediaCarousel title="Albums" note="full releases" itemWidth="minmax(160px,188px)">
      {overview.data.albums.map((album) => (
        <AlbumCard key={album.slug} album={{ ...album, artistName: album.artist?.name }} />
      ))}
    </MediaCarousel>
  );
}

/** Every song on Bandcoin, sortable, with Play all: the bottom of Home. */
export function AllSongs() {
  const [sort, setSort] = useState<Sort>("newest");
  const tracks = api.music.tracks.useInfiniteQuery({ sort }, { getNextPageParam: (page) => page.nextCursor });
  const list = tracks.data?.pages.flatMap((page) => page.tracks) ?? [];
  const playQueue = usePlayer((state) => state.playQueue);

  return (
    <>
      <section className="grid gap-3" aria-label="All songs">
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
        {tracks.hasNextPage && (
          <Button variant="secondary" className="justify-self-center" disabled={tracks.isFetchingNextPage} onClick={() => void tracks.fetchNextPage()}>
            {tracks.isFetchingNextPage ? "Loading…" : "Load more"}
          </Button>
        )}
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
        badgeOf={(track) => ((track as (typeof tracks)[number]).source === "created" ? "Yours" : "Owned")}
      />
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
    <ol className="grid gap-0.5">
      {tracks.map((track, index) => (
        <TrackRow key={track.id} track={track} position={index} list={tracks} badge={badgeOf?.(track)} />
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
