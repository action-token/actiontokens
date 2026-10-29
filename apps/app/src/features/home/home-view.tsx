"use client";

import Link from "next/link";

import { MediaCarousel } from "@bandcoin/ui/patterns/media-carousel";

import type { RouterOutputs } from "~/trpc/react";

import { ItemCard, POSTER_WIDTH } from "../catalog/item-card";
import { AlbumsCarousel, AllSongs } from "../music/music-view";

type Home = RouterOutputs["catalog"]["home"];

const seeAll = (href: string) => (
  <Link href={href} className="text-fg-muted hover:text-fg text-[13px] font-semibold">
    See all
  </Link>
);

/** Home below the hero: trending, new songs, albums, then every song. Artists and bounties live in the right panel. */
export function HomeView({ home }: { home: Home }) {
  return (
    <div className="grid gap-9">
      <MediaCarousel title="Trending this week" note="what fans are playing and buying" action={seeAll("/marketplace?sort=popular")} itemWidth={POSTER_WIDTH}>
        {home.trending.map((item) => (
          <ItemCard key={item.id} item={item} queue={home.trending} />
        ))}
      </MediaCarousel>

      <MediaCarousel title="New songs" note="fresh off the press" itemWidth={POSTER_WIDTH}>
        {home.newMusic.map((item) => (
          <ItemCard key={item.id} item={item} queue={home.newMusic} />
        ))}
      </MediaCarousel>

      <AlbumsCarousel />

      <AllSongs />
    </div>
  );
}
