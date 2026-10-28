"use client";

import { Trophy } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Skeleton } from "@bandcoin/ui/components/skeleton";

import { Money } from "~/components/money";
import { api } from "~/trpc/react";

import { currentTrack, usePlayer } from "../player/player-store";

/**
 * The right-hand panel on Home and Music: what's playing and up next, then
 * live bounties and top artists on Home.
 */
export function ContextPanel() {
  const pathname = usePathname();

  return (
    <div className="grid content-start gap-7">
      <NowPlaying />
      {pathname === "/" && <HomeExtras />}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3">
      <h2 className="display text-base">{title}</h2>
      {children}
    </section>
  );
}

function NowPlaying() {
  const { queue, index, playQueue } = usePlayer();
  const track = currentTrack({ queue, index });
  if (!track) return null;
  const upNext = queue.slice(index + 1, index + 5);

  return (
    <>
      <Section title="Now playing">
        <Link href={`/item/${track.slug}`} className="grid gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- covers come from many hosts */}
          <img
            src={track.coverUrl}
            alt=""
            className="aspect-square w-full rounded-md border object-cover"
          />
          <div>
            <h3 className="truncate text-base font-bold">{track.title}</h3>
            <p className="text-fg-muted truncate text-[13px]">{track.artistName}</p>
          </div>
        </Link>
      </Section>
      {upNext.length > 0 && (
        <Section title="Up next">
          <ul className="grid gap-1">
            {upNext.map((entry, offset) => (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => playQueue(queue, index + 1 + offset)}
                  className="hover:bg-surface-2 grid w-full grid-cols-[36px_minmax(0,1fr)] items-center gap-3 rounded-sm p-1 text-left text-[13px]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- covers come from many hosts */}
                  <img src={entry.coverUrl} alt="" className="size-9 rounded-sm object-cover" />
                  <span className="min-w-0">
                    <b className="block truncate font-semibold">{entry.title}</b>
                    <span className="text-fg-muted block truncate">{entry.artistName}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}

function HomeExtras() {
  const home = api.catalog.home.useQuery(undefined, { staleTime: 60_000 });
  if (home.isPending) return <PanelSkeleton />;
  if (!home.data) return null;
  return (
    <>
      {home.data.bounties.length > 0 && (
        <Section title="Live bounties">
          <ul className="grid gap-2">
            {home.data.bounties.map((bounty) => (
              <li key={bounty.id}>
                <Link
                  href={`/bounty/${bounty.id}`}
                  className="bg-surface-2 hover:bg-surface-3 grid gap-1 rounded-md p-3 text-[13px] transition-colors"
                >
                  <b className="flex items-center gap-1.5 font-semibold">
                    <Trophy className="text-primary-text size-3.5 shrink-0" />
                    <span className="truncate">{bounty.title}</span>
                  </b>
                  <span className="text-fg-muted flex items-center justify-between gap-2">
                    <span className="truncate">{bounty.artist.name}</span>
                    <Money
                      amount={bounty.prize.amount}
                      currency={bounty.prize.currency}
                      className="text-fg shrink-0"
                    />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}
      <Section title="Top artists">
        <ul className="grid gap-1">
          {home.data.artists.slice(0, 6).map((artist) => (
            <li key={artist.slug}>
              <Link
                href={`/artist/${artist.slug}`}
                className="hover:bg-surface-2 flex items-center gap-3 rounded-sm p-1.5 text-[13px]"
              >
                <Avatar name={artist.name} url={artist.avatarUrl} />
                <span className="min-w-0 flex-1">
                  <b className="block truncate font-semibold">{artist.name}</b>
                  <span className="text-fg-muted">
                    {artist.followers.toLocaleString()} followers
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}

export function Avatar({
  name,
  url,
  className,
}: {
  name: string;
  url: string | null;
  className?: string;
}) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element -- avatars come from many hosts
    <img src={url} alt="" className={className ?? "size-9 shrink-0 rounded-full object-cover"} />
  ) : (
    <span
      className={
        className ??
        "bg-surface-3 grid size-9 shrink-0 place-items-center rounded-full text-xs font-bold"
      }
    >
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}

function PanelSkeleton() {
  return (
    <div className="grid gap-2">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-14 w-full" />
    </div>
  );
}
