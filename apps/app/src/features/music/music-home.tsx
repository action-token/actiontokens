"use client";

import { Play } from "lucide-react";
import Link from "next/link";

import { MediaCarousel } from "@actiontokens/ui/patterns/media-carousel";
import { PageHeader } from "@actiontokens/ui/patterns/page-header";

import type { RouterOutputs } from "~/trpc/react";

import { OrgCircle } from "../artists/artists-view";
import { POSTER_WIDTH } from "../catalog/item-card";
import { NewSongsCarousel, RecentlyPlayed, TrendingCarousel } from "../home/home-view";
import { usePlayer } from "../player/player-store";
import { AlbumsCarousel, AllSongs } from "./music-view";

type Home = RouterOutputs["catalog"]["home"];

const seeAll = (href: string) => (
  <Link href={href} className="text-fg-muted hover:text-fg text-[13px] font-semibold">
    See all
  </Link>
);

/**
 * The music home: recently played, trending this week, the popular organizations behind the
 * music, new songs, albums, then every song.
 */
export function MusicHome({ home }: { home: Home }) {
  const playQueue = usePlayer((state) => state.playQueue);
  const top = home.trending.length > 0 ? home.trending : home.newMusic;
  const orgs = home.artists.filter((org) => org.items > 0);
  return (
    <div className="grid gap-9">
      <PageHeader
        title="Music"
        note="*recently played, trending this week, and the orgs behind it*"
        actions={
          top.length > 0 && (
            <button type="button" className="lp-cta !h-11 !px-5" onClick={() => playQueue(top)}>
              <Play className="size-4" fill="currentColor" strokeWidth={0} />
              {home.trending.length > 0 ? "Play trending" : "Play new songs"}
            </button>
          )
        }
      />
      <RecentlyPlayed />
      <TrendingCarousel home={home} />
      {orgs.length > 0 && (
        <MediaCarousel
          title="Popular organizations"
          note="most followed"
          action={seeAll("/artists")}
          itemWidth={POSTER_WIDTH}
        >
          {orgs.map((org) => (
            <OrgCircle
              key={org.slug}
              artist={{ ...org, songs: org.items, tokenCode: org.token?.code ?? null }}
            />
          ))}
        </MediaCarousel>
      )}
      <NewSongsCarousel home={home} />
      <AlbumsCarousel action={seeAll("/albums")} />
      <AllSongs seeAllHref="/songs" />
    </div>
  );
}
