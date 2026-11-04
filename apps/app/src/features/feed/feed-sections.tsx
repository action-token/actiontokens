"use client";

import { CalendarDays, Pause, Play } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { cn } from "@bandcoin/ui/lib/cn";

import { api } from "~/trpc/react";

import { FollowButton } from "../artist/follow-button";
import { currentTrack, usePlayer } from "../player/player-store";
import { Avatar } from "../shell/context-panel";

const AVATAR =
  "bg-surface-3 grid size-12 shrink-0 place-items-center rounded-full object-cover text-xs font-bold";

const day = (date: Date | string) =>
  new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(date));
const time = (date: Date | string) =>
  new Intl.DateTimeFormat("en", { weekday: "short", hour: "numeric", minute: "2-digit" }).format(
    new Date(date),
  );

/** One block of the feed's side columns, headed like the Home page's rows. */
function Block({
  title,
  note,
  href,
  columns,
  children,
}: {
  title: string;
  note: string;
  href?: string;
  /** Grid columns in the wide side column (one by default) */
  columns?: string;
  children: ReactNode;
}) {
  return (
    <section className="grid grid-cols-[minmax(0,1fr)] content-start gap-3">
      <div className="flex items-end justify-between gap-2 px-1">
        <div className="min-w-0">
          <h2 className="display text-xl leading-none">{title}</h2>
          <p className="marker text-fg-muted mt-1 text-sm leading-none">{note}</p>
        </div>
        {href && (
          <Link
            href={href}
            className="text-fg-muted hover:text-fg shrink-0 text-xs font-semibold whitespace-nowrap"
          >
            See all
          </Link>
        )}
      </div>
      {/* Swipeable rows on narrower screens, stacked cards in the side columns. */}
      <div
        className={cn(
          "-mx-4 flex snap-x scroll-px-4 [scrollbar-width:none] gap-3 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:scroll-px-6 sm:px-6 xl:mx-0 xl:grid xl:overflow-visible xl:px-0 xl:pb-0",
          columns,
        )}
      >
        {children}
      </div>
    </section>
  );
}

/** The poster look the Home page uses: full-bleed picture, dark fade, text on top. */
const POSTER =
  "group bg-surface-3 hover:border-fg relative isolate block overflow-hidden rounded-[1.4rem] border-2 transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-[5px_6px_0_0_var(--color-primary)]";
const ITEM = "shrink-0 snap-start xl:w-auto";
const FADE =
  "absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-t from-black/85 via-black/45 to-transparent";

const Loading = ({ className }: { className: string }) => (
  <>
    {[0, 1, 2].map((key) => (
      <Skeleton key={key} className={cn("rounded-[1.4rem]", ITEM, className)} />
    ))}
  </>
);

/** The next events from every artist, as posters. */
export function UpcomingEvents() {
  const events = api.event.upcoming.useQuery({ limit: 3 }, { staleTime: 60_000 });
  if (events.data?.length === 0) return null;
  return (
    <Block title="Upcoming events" note="live near you soon">
      {events.isPending ? (
        <Loading className="aspect-[4/3] w-64 xl:aspect-[16/9]" />
      ) : (
        events.data?.map((event) => (
          <Link
            key={event.id}
            href={`/artist/${event.artist.slug}`}
            className={cn(POSTER, ITEM, "w-64")}
          >
            <div className="relative aspect-[4/3] xl:aspect-[16/9]">
              {event.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- covers come from many hosts
                <img
                  src={event.coverUrl}
                  alt=""
                  loading="lazy"
                  className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              ) : (
                <span className="text-fg-faint absolute inset-0 grid place-items-center">
                  <CalendarDays className="size-8" />
                </span>
              )}
              <div aria-hidden className={FADE} />
              <span className="bg-primary text-primary-foreground display absolute top-2.5 right-2.5 rotate-3 rounded-lg px-2 py-1 text-sm leading-none">
                {day(event.startsAt)}
              </span>
              <div className="absolute inset-x-0 bottom-0 grid gap-0.5 p-3 text-white">
                <p className="truncate text-xs font-semibold text-white/80">
                  {time(event.startsAt)}
                  {event.venueName ? ` · ${event.venueName}` : ""}
                </p>
                <p className="display line-clamp-2 text-lg leading-[1.05]">{event.title}</p>
              </div>
            </div>
          </Link>
        ))
      )}
    </Block>
  );
}

/** The newest songs as square posters you can play on the spot. */
export function NewMusic() {
  const music = api.music.overview.useQuery(undefined, { staleTime: 60_000 });
  const { playQueue, toggle } = usePlayer();
  const playing = usePlayer((state) => state.playing);
  const current = usePlayer((state) => currentTrack(state)?.id ?? null);
  const tracks = (music.data?.newest ?? []).filter((track) => track.playable).slice(0, 4);
  if (!music.isPending && tracks.length === 0) return null;
  return (
    <Block title="New music" note="fresh off the press" href="/music" columns="xl:grid-cols-2">
      {music.isPending ? (
        <>
          {[0, 1, 2, 3].map((key) => (
            <Skeleton key={key} className={cn("aspect-square w-36 rounded-[1.4rem]", ITEM)} />
          ))}
        </>
      ) : (
        tracks.map((track, index) => {
          const isCurrent = current === track.id;
          return (
            <div key={track.id} className={cn(POSTER, ITEM, "w-36")}>
              <div className="relative aspect-square">
                {/* eslint-disable-next-line @next/next/no-img-element -- covers come from many hosts */}
                <img
                  src={track.coverUrl}
                  alt=""
                  loading="lazy"
                  className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div aria-hidden className={FADE} />
                <div className="absolute inset-x-0 bottom-0 grid gap-0.5 p-2.5 pr-11 text-white">
                  <p className="truncate text-[11px] font-semibold text-white/80">
                    {track.artistName}
                  </p>
                  <p className="display line-clamp-2 text-sm leading-[1.05]">{track.title}</p>
                </div>
                <Link
                  href={`/item/${track.slug}`}
                  aria-label={`${track.title} by ${track.artistName}`}
                  className="absolute inset-0"
                />
                <button
                  type="button"
                  aria-label={`${isCurrent && playing ? "Pause" : "Play"} ${track.title}`}
                  onClick={() => (isCurrent ? toggle() : playQueue(tracks, index))}
                  className="bg-primary text-primary-foreground absolute right-2 bottom-2 z-10 grid size-8 place-items-center rounded-full shadow-lg transition-transform hover:scale-105"
                >
                  {isCurrent && playing ? (
                    <Pause className="size-3.5 fill-current" />
                  ) : (
                    <Play className="size-3.5 translate-x-px fill-current" />
                  )}
                </button>
              </div>
            </div>
          );
        })
      )}
    </Block>
  );
}

/** Artists you don't follow yet. */
export function ArtistsToFollow() {
  const artists = api.artist.suggested.useQuery(
    { limit: 3, excludeFollowed: true },
    { staleTime: 60_000 },
  );
  if (artists.data?.length === 0) return null;
  return (
    <Block title="Artists to follow" note="find your next favourite" href="/artists">
      {artists.isPending ? (
        <Loading className="h-[4.5rem] w-72" />
      ) : (
        artists.data?.map((artist) => (
          <div
            key={artist.slug}
            className={cn(
              "bg-surface flex items-center gap-3 rounded-[1.4rem] border-2 p-3",
              ITEM,
              "w-72",
            )}
          >
            <Link
              href={`/artist/${artist.slug}`}
              className="flex min-w-0 flex-1 items-center gap-3"
            >
              <span className="ring-primary ring-offset-surface shrink-0 rounded-full ring-2 ring-offset-2">
                <Avatar name={artist.name} url={artist.avatarUrl} className={AVATAR} />
              </span>
              <span className="min-w-0">
                <span className="display block truncate text-base leading-tight">
                  {artist.name}
                </span>
                <span className="text-fg-muted block truncate text-xs">
                  {artist.followers.toLocaleString("en-US")} followers
                </span>
              </span>
            </Link>
            <FollowButton compact slug={artist.slug} initial={artist.following} />
          </div>
        ))
      )}
    </Block>
  );
}

/** On screens without side columns, the same blocks sit above the posts. */
export function DiscoverBand() {
  return (
    <div className="grid gap-6 xl:hidden">
      <UpcomingEvents />
      <NewMusic />
      <ArtistsToFollow />
    </div>
  );
}
