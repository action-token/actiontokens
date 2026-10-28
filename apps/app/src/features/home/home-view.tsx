"use client";

import { Trophy } from "lucide-react";
import Link from "next/link";

import { MediaCarousel, SectionTitle } from "@bandcoin/ui/patterns/media-carousel";

import { Money } from "~/components/money";
import type { RouterOutputs } from "~/trpc/react";

import { ItemCard, POSTER_WIDTH } from "../catalog/item-card";
import { Avatar } from "../shell/context-panel";

type Home = RouterOutputs["catalog"]["home"];

const seeAll = (href: string) => (
  <Link href={href} className="text-fg-muted hover:text-fg text-[13px] font-semibold">
    See all
  </Link>
);

/** Home below the hero: trending, new music, top artists, live bounties. */
export function HomeView({ home }: { home: Home }) {
  return (
    <div className="grid gap-9">

      <MediaCarousel title="Trending this week" note="what fans are playing and buying" action={seeAll("/marketplace?sort=popular")} itemWidth={POSTER_WIDTH}>
        {home.trending.map((item) => (
          <ItemCard key={item.id} item={item} queue={home.trending} />
        ))}
      </MediaCarousel>

      <MediaCarousel title="New music" note="fresh off the press" action={seeAll("/music")} itemWidth={POSTER_WIDTH}>
        {home.newMusic.map((item) => (
          <ItemCard key={item.id} item={item} queue={home.newMusic} />
        ))}
      </MediaCarousel>

      <MediaCarousel title="Top artists" note="the artists fans follow most" itemWidth="minmax(120px,136px)">
        {home.artists.map((artist) => (
          <Link key={artist.slug} href={`/artist/${artist.slug}`} className="group grid justify-items-center gap-2 text-center">
            <Avatar
              name={artist.name}
              url={artist.avatarUrl}
              className="bg-surface-3 grid aspect-square w-full place-items-center rounded-full object-cover text-xl font-bold transition-transform duration-250 group-hover:-translate-y-[3px]"
            />
            <span className="display w-full truncate text-sm">{artist.name}</span>
            <span className="text-fg-muted -mt-2 text-xs">{artist.items} items</span>
          </Link>
        ))}
      </MediaCarousel>

      {home.bounties.length > 0 && (
        <section className="grid gap-3" aria-label="Live bounties">
          <div className="flex items-end justify-between gap-3">
            <SectionTitle title="Live bounties" note="make something, win the prize" />
            {seeAll("/bounties")}
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {home.bounties.map((bounty) => (
              <li key={bounty.id}>
                <Link href={`/bounty/${bounty.id}`} className="bg-surface hover:border-border-strong grid h-full gap-2 rounded-lg border p-4 transition-colors">
                  <span className="text-fg-muted flex items-center gap-2 text-xs font-semibold">
                    <Trophy className="text-primary-text size-4" /> {bounty.artist.name}
                  </span>
                  <b className="display text-base leading-snug">{bounty.title}</b>
                  <p className="text-fg-muted line-clamp-2 text-[13px]">{bounty.summary}</p>
                  <span className="mt-auto flex items-center justify-between pt-1 text-[13px]">
                    <Money amount={bounty.prize.amount} currency={bounty.prize.currency} className="font-semibold" />
                    <span className="text-fg-muted">{bounty.participants} joined</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
