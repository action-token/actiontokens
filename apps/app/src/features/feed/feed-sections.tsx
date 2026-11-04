"use client";

import { CalendarDays, Music2, Pause, Play, UserPlus, Zap } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { cn } from "@bandcoin/ui/lib/cn";

import { Money } from "~/components/money";
import { api } from "~/trpc/react";

import { FollowButton } from "../artist/follow-button";
import { currentTrack, usePlayer } from "../player/player-store";
import { Avatar } from "../shell/context-panel";

const AVATAR =
  "bg-surface-3 grid size-11 shrink-0 place-items-center rounded-full object-cover text-xs font-bold";

const when = (date: Date | string) =>
  new Intl.DateTimeFormat("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));

/** A card of the discover band: a title, "See all", and a short list. */
function Card({
  icon: Icon,
  title,
  href,
  children,
}: {
  icon: typeof CalendarDays;
  title: string;
  href?: string;
  children: ReactNode;
}) {
  return (
    <section className="bg-surface grid grid-cols-[minmax(0,1fr)] content-start gap-2 rounded-[1.2rem] border p-4">
      <div className="flex items-center justify-between gap-2 px-1">
        <h2 className="display flex min-w-0 items-center gap-2 text-base whitespace-nowrap">
          <Icon className="text-primary-text size-4" /> {title}
        </h2>
        {href && (
          <Link
            href={href}
            className="text-fg-muted hover:text-fg shrink-0 text-xs font-semibold whitespace-nowrap"
          >
            See all
          </Link>
        )}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-1">{children}</div>
    </section>
  );
}

const Loading = () => (
  <>
    {[0, 1, 2].map((key) => (
      <Skeleton key={key} className="h-14 w-full rounded-lg" />
    ))}
  </>
);

const ROW = "hover:bg-surface-2 flex items-center gap-3 rounded-lg p-2 transition-colors";

/** The next events from every artist. */
export function UpcomingEvents() {
  const events = api.event.upcoming.useQuery({ limit: 3 }, { staleTime: 60_000 });
  if (events.data?.length === 0) return null;
  return (
    <Card icon={CalendarDays} title="Upcoming events">
      {events.isPending ? (
        <Loading />
      ) : (
        events.data?.map((event) => (
          <Link key={event.id} href={`/artist/${event.artist.slug}`} className={ROW}>
            {event.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- covers come from many hosts
              <img
                src={event.coverUrl}
                alt=""
                className="size-14 shrink-0 rounded-lg object-cover"
              />
            ) : (
              <span className="bg-surface-2 text-fg-faint grid size-14 shrink-0 place-items-center rounded-lg">
                <CalendarDays className="size-5" />
              </span>
            )}
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{event.title}</span>
              <span className="text-fg-muted block truncate text-xs">{when(event.startsAt)}</span>
              <span className="text-fg-faint block truncate text-xs">
                {event.venueName ?? event.artist.name}
              </span>
            </span>
          </Link>
        ))
      )}
    </Card>
  );
}

/** The newest songs, playable right here. */
export function NewMusic() {
  const music = api.music.overview.useQuery(undefined, { staleTime: 60_000 });
  const { playQueue, toggle } = usePlayer();
  const playing = usePlayer((state) => state.playing);
  const current = usePlayer((state) => currentTrack(state)?.id ?? null);
  const tracks = (music.data?.newest ?? []).filter((track) => track.playable).slice(0, 3);
  if (!music.isPending && tracks.length === 0) return null;
  return (
    <Card icon={Music2} title="New music" href="/music">
      {music.isPending ? (
        <Loading />
      ) : (
        tracks.map((track, index) => {
          const isCurrent = current === track.id;
          return (
            <div key={track.id} className={ROW}>
              <button
                type="button"
                aria-label={`${isCurrent && playing ? "Pause" : "Play"} ${track.title}`}
                onClick={() => (isCurrent ? toggle() : playQueue(tracks, index))}
                className="relative size-14 shrink-0 overflow-hidden rounded-lg"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- covers come from many hosts */}
                <img src={track.coverUrl} alt="" className="size-full object-cover" />
                <span className="absolute inset-0 grid place-items-center bg-black/35 text-white">
                  {isCurrent && playing ? (
                    <Pause className="size-5 fill-current" />
                  ) : (
                    <Play className="size-5 fill-current" />
                  )}
                </span>
              </button>
              <Link href={`/item/${track.slug}`} className="min-w-0">
                <span className="block truncate text-sm font-semibold">{track.title}</span>
                <span className="text-fg-muted block truncate text-xs">{track.artistName}</span>
              </Link>
            </div>
          );
        })
      )}
    </Card>
  );
}

/** Artists you don't follow yet, each with a Follow button. */
export function ArtistsToFollow() {
  const artists = api.artist.suggested.useQuery(
    { limit: 3, excludeFollowed: true },
    { staleTime: 60_000 },
  );
  if (artists.data?.length === 0) return null;
  return (
    <Card icon={UserPlus} title="Artists to follow" href="/marketplace">
      {artists.isPending ? (
        <Loading />
      ) : (
        artists.data?.map((artist) => (
          <div key={artist.slug} className={ROW}>
            <Link
              href={`/artist/${artist.slug}`}
              className="flex min-w-0 flex-1 items-center gap-3"
            >
              <Avatar name={artist.name} url={artist.avatarUrl} className={AVATAR} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{artist.name}</span>
                <span className="text-fg-muted block truncate text-xs">
                  {artist.followers.toLocaleString("en-US")} followers
                </span>
              </span>
            </Link>
            <FollowButton compact slug={artist.slug} initial={artist.following} />
          </div>
        ))
      )}
    </Card>
  );
}

/** The bounties with the biggest prizes. */
export function TopBounties() {
  const top = api.bounty.top.useQuery(undefined, { staleTime: 60_000 });
  if (top.data?.length === 0) return null;
  return (
    <Card icon={Zap} title="Top bounties" href="/bounties">
      {top.isPending ? (
        <Loading />
      ) : (
        top.data?.slice(0, 3).map((bounty, index) => (
          <Link key={bounty.id} href={`/bounty/${bounty.id}`} className={ROW}>
            <span
              className={cn(
                "marker w-6 shrink-0 text-lg",
                index === 0 ? "text-primary-text" : "text-fg-faint",
              )}
            >
              #{index + 1}
            </span>
            <span className="min-w-0 flex-1">
              <b className="block truncate text-[13px] font-semibold">{bounty.title}</b>
              <Money
                amount={bounty.prize.amount}
                currency={bounty.prize.currency}
                code={bounty.prize.code}
                short
                className="text-fg-muted text-xs"
              />
            </span>
          </Link>
        ))
      )}
    </Card>
  );
}

/** On screens without side columns, the same cards sit above the posts. */
export function DiscoverBand() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:hidden">
      <UpcomingEvents />
      <NewMusic />
      <ArtistsToFollow />
      <TopBounties />
    </div>
  );
}
