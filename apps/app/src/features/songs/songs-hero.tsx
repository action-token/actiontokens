"use client";

import {
  ChevronLeft,
  ChevronRight,
  Clock3,
  Crown,
  Flame,
  Headphones,
  Play,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Skeleton } from "@actiontokens/ui/components/skeleton";
import { cn } from "@actiontokens/ui/lib/cn";

import { HeroShare, HeroStat } from "~/components/hero-carousel";
import { Money } from "~/components/money";
import { api, type RouterOutputs } from "~/trpc/react";

import { compact } from "../artists/artist-circle";
import { usePlayer } from "../player/player-store";

type Song = RouterOutputs["music"]["browse"]["tracks"][number];

export const SONGS_HERO_COUNT = 3;
const ROTATE_MS = 7000;

const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/**
 * The three songs played most this week, laid out like Home's hero: the title in huge
 * type on the left, the cover as a tilted sticker on the right, dots and arrows under.
 * Nothing played this week: no hero.
 */
export function SongsHero() {
  const top = api.music.browse.useQuery(
    { sort: "trending", playedThisWeek: true, limit: SONGS_HERO_COUNT },
    { staleTime: 60_000 },
  );
  if (top.isPending) return <HeroSkeleton />;
  const songs = top.data?.tracks ?? [];
  if (songs.length === 0) return null;
  return <Slides songs={songs} />;
}

function Slides({ songs }: { songs: Song[] }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [touchX, setTouchX] = useState<number | null>(null);
  const playQueue = usePlayer((state) => state.playQueue);
  const count = songs.length;
  const go = useCallback((to: number) => setActive(((to % count) + count) % count), [count]);

  useEffect(() => {
    if (paused || count < 2) return;
    const timer = setTimeout(() => go(active + 1), ROTATE_MS);
    return () => clearTimeout(timer);
  }, [active, paused, count, go]);

  const song = songs[Math.min(active, count - 1)];
  if (!song) return null;
  const rank = active + 1;
  const href = `/item/${song.slug}`;
  const playable = songs.filter((entry) => entry.playable);

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Trending songs"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={(event) => setTouchX(event.touches[0]?.clientX ?? null)}
      onTouchEnd={(event) => {
        const end = event.changedTouches[0]?.clientX;
        if (touchX !== null && end !== undefined && Math.abs(end - touchX) > 40)
          go(active + (end < touchX ? 1 : -1));
        setTouchX(null);
      }}
      className="bleed relative isolate overflow-hidden border-b"
    >
      {/* the cover, blurred, as a soft wash behind everything */}
      {/* eslint-disable-next-line @next/next/no-img-element -- covers come from many hosts */}
      <img
        key={`wash-${song.id}`}
        src={song.coverUrl}
        alt=""
        aria-hidden
        className="animate-in fade-in absolute inset-0 -z-10 size-full scale-125 object-cover opacity-25 blur-3xl duration-700"
      />

      <div className="grid max-w-[var(--page-max,96rem)] px-4 pt-6 sm:px-8 lg:pt-8">
        <div
          key={song.id}
          role="group"
          aria-roledescription="slide"
          aria-label={`${rank} of ${count}: ${song.title}`}
          className="animate-in fade-in slide-in-from-bottom-3 grid items-center gap-8 duration-500 md:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] md:gap-10"
        >
          <div className="relative order-first flex justify-center md:order-last">
            <div className="relative w-[min(52vw,12rem)] rotate-3 sm:w-[14rem] md:w-full md:max-w-[17rem]">
              <Link href={href} tabIndex={-1} className="group block">
                <div className="border-fg bg-surface overflow-hidden rounded-[1.6rem] border-[3px] shadow-[10px_12px_0_0_var(--color-primary)] transition-transform duration-300 group-hover:-translate-y-1 group-hover:-rotate-3">
                  {/* eslint-disable-next-line @next/next/no-img-element -- covers come from many hosts */}
                  <img
                    src={song.coverUrl}
                    alt={song.title}
                    className="aspect-square w-full object-cover"
                  />
                </div>
              </Link>
              <span className="marker bg-primary text-primary-foreground pointer-events-none absolute -top-5 -left-4 -rotate-12 rounded-lg px-2.5 py-1 text-base sm:-left-8">
                #{rank} this week!
              </span>
            </div>
          </div>

          <div className="grid min-w-0 content-center gap-4">
            <div className="grid gap-2">
              <p className="marker text-fg-muted flex -rotate-2 items-center gap-1.5 text-lg">
                {rank === 1 && <Crown className="text-primary-text size-4" strokeWidth={2.6} />}
                *#{rank} trending, by{" "}
                {song.artistSlug ? (
                  <Link
                    href={`/artist/${song.artistSlug}`}
                    className="text-primary-text hover:underline"
                  >
                    {song.artistName}
                  </Link>
                ) : (
                  song.artistName
                )}
                *
              </p>
              <h2 className="display line-clamp-2 text-5xl break-words sm:text-6xl">
                <Link href={href} className="hover:underline">
                  {song.title}
                </Link>
              </h2>
            </div>

            <ul className="flex flex-wrap items-center gap-2" aria-label="Counts">
              <HeroStat icon={Flame} value={compact(song.playsThisWeek ?? 0)} label="this week" />
              <HeroStat icon={Headphones} value={compact(song.playCount)} label="all-time plays" />
              {song.durationSec !== null && (
                <HeroStat icon={Clock3} value={clock(song.durationSec)} label="long" />
              )}
            </ul>

            {song.price && (
              <div className="bg-primary text-primary-foreground inline-grid w-fit -rotate-2 gap-0.5 rounded-2xl px-4 py-2">
                <Money
                  amount={song.price.actionToken}
                  currency="ACTION"
                  short
                  onBrand
                  className="display text-4xl leading-none"
                />
                <p className="marker text-sm">
                  ≈ <Money amount={song.price.usd} currency="USD" /> · to own it
                </p>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={href}
                className="bg-primary text-primary-foreground inline-flex h-12 -rotate-1 items-center gap-2 rounded-2xl px-6 transition-transform duration-200 hover:scale-[1.03] hover:rotate-0"
              >
                <Zap className="size-5 fill-current" />
                <span className="marker text-lg">{song.price ? "Buy now" : "See the song"}</span>
              </Link>
              {song.playable && (
                <button
                  type="button"
                  // The whole top three, starting from this one.
                  onClick={() =>
                    playQueue(
                      playable,
                      Math.max(
                        0,
                        playable.findIndex((entry) => entry.id === song.id),
                      ),
                    )
                  }
                  className="bg-surface-3 inline-flex h-12 rotate-1 items-center gap-2 rounded-2xl px-5 transition-transform duration-200 hover:scale-[1.03] hover:rotate-0"
                >
                  <Play className="size-5 fill-current" />
                  <span className="marker text-lg">Play preview</span>
                </button>
              )}
              <HeroShare name={song.title} href={href} />
            </div>
          </div>
        </div>

        {count > 1 && (
          <div className="flex items-center justify-between gap-3 pt-5 pb-6">
            <div className="flex items-center gap-2" role="tablist" aria-label="Trending songs">
              {songs.map((entry, index) => (
                <button
                  key={entry.id}
                  type="button"
                  role="tab"
                  aria-selected={index === active}
                  aria-label={`Show ${entry.title}`}
                  onClick={() => go(index)}
                  className={cn(
                    "relative h-3 overflow-hidden rounded-full transition-[width,background-color] duration-300",
                    index === active ? "bg-fg/20 w-12" : "bg-fg/30 hover:bg-fg/60 w-3",
                  )}
                >
                  {index === active && (
                    <span
                      key={`${active}-${paused}`}
                      className={cn(
                        "bg-primary absolute inset-0 origin-left rounded-full",
                        !paused && "animate-[hero-progress_7s_linear]",
                      )}
                    />
                  )}
                </button>
              ))}
            </div>
            <div className="hidden gap-2 sm:flex">
              <button
                type="button"
                onClick={() => go(active - 1)}
                aria-label="Previous slide"
                className="bg-surface hover:border-border-strong grid size-11 place-items-center rounded-full border"
              >
                <ChevronLeft className="size-5" />
              </button>
              <button
                type="button"
                onClick={() => go(active + 1)}
                aria-label="Next slide"
                className="bg-surface hover:border-border-strong grid size-11 place-items-center rounded-full border"
              >
                <ChevronRight className="size-5" />
              </button>
            </div>
          </div>
        )}
      </div>
      <style>{"@keyframes hero-progress{from{transform:scaleX(0)}to{transform:scaleX(1)}}"}</style>
    </section>
  );
}

/** Holds the hero's height while the songs load, so the page doesn't jump. */
function HeroSkeleton() {
  return (
    <section aria-hidden className="bleed border-b">
      <div className="grid max-w-[var(--page-max,96rem)] items-center gap-8 px-4 pt-6 pb-6 sm:px-8 md:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] md:gap-10 lg:pt-8">
        <div className="order-last grid gap-4 md:order-first">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-16 w-3/4" />
          <Skeleton className="h-12 w-72 rounded-2xl" />
        </div>
        <Skeleton className="mx-auto aspect-square w-[min(52vw,12rem)] rounded-[1.6rem] md:max-w-[17rem]" />
      </div>
    </section>
  );
}
