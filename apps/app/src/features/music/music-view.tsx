"use client";

import { ListMusic, Play } from "lucide-react";
import { useSession } from "next-auth/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Button } from "@bandcoin/ui/components/button";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@bandcoin/ui/components/tabs";
import { EmptyState } from "@bandcoin/ui/patterns/empty-state";
import { MediaCarousel, SectionTitle } from "@bandcoin/ui/patterns/media-carousel";
import { useConnectWalletDialogStore } from "@bandcoin/wallet";

import { api, type RouterInputs } from "~/trpc/react";

import { type ItemCardData, ItemCard, POSTER_WIDTH } from "../catalog/item-card";
import { usePlayer } from "../player/player-store";
import { TrackRow } from "./track-row";

type Sort = NonNullable<RouterInputs["music"]["tracks"]["sort"]>;
const SORTS: { value: Sort; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "popular", label: "Most played" },
  { value: "title", label: "A–Z" },
];

/** Music: new songs up top, every song below; "Your items" lists what you made or own. */
export function MusicView() {
  const router = useRouter();
  const pathname = usePathname();
  const tab = useSearchParams().get("tab") === "mine" ? "mine" : "all";

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => router.replace(value === "mine" ? `${pathname}?tab=mine` : pathname, { scroll: false })}
      className="gap-6"
    >
      <TabsList className="w-fit">
        <TabsTrigger value="all" className="font-hud">
          Music
        </TabsTrigger>
        <TabsTrigger value="mine" className="font-hud">
          Your items
        </TabsTrigger>
      </TabsList>
      <TabsContent value="all" className="grid gap-9">
        <AllMusic />
      </TabsContent>
      <TabsContent value="mine">
        <YourItems />
      </TabsContent>
    </Tabs>
  );
}

function AllMusic() {
  const [sort, setSort] = useState<Sort>("newest");
  const overview = api.music.overview.useQuery();
  const tracks = api.music.tracks.useInfiniteQuery({ sort }, { getNextPageParam: (page) => page.nextCursor });
  const list = tracks.data?.pages.flatMap((page) => page.tracks) ?? [];

  return (
    <>
      {overview.data && overview.data.newest.length > 0 && (
        <MediaCarousel title="New songs" note="just dropped" itemWidth={POSTER_WIDTH}>
          {overview.data.newest.map((item) => (
            <ItemCard key={item.id} item={item} queue={overview.data.newest} />
          ))}
        </MediaCarousel>
      )}
      <section className="grid gap-3" aria-label="All songs">
        <div className="flex items-center justify-between gap-3">
          <SectionTitle title="All songs" note="tap a row to listen" />
          <SortSelect value={sort} onChange={setSort} />
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

function YourItems() {
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
    <section className="grid gap-3" aria-label="Your items">
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
