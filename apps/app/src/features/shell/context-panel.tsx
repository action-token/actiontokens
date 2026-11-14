"use client";

import Link from "next/link";

import { Money } from "~/components/money";
import { api } from "~/trpc/react";

import { currentTrack, usePlayer } from "../player/player-store";
import { RightRule } from "./right-frame";
import { showSidebarBuy } from "./sidebar-buy";
import { UpNextList, useQueueAhead } from "./up-next";

/** The right-hand panel on Home while a song is loaded: what's playing and what's next. */
export function ContextPanel() {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] content-start gap-5">
      <NowPlaying />
    </div>
  );
}

function NowPlaying() {
  const { queue, index } = usePlayer();
  const track = currentTrack({ queue, index });
  // Same query (and cache) as the player bar's: tells whether the listener hears only the preview.
  const playback = api.media.play.useQuery(
    { itemId: track?.id ?? "" },
    { enabled: Boolean(track), staleTime: 30 * 60_000 },
  );
  const queueAhead = useQueueAhead();
  if (!track) return null;
  const offerBuy = showSidebarBuy(track, playback.data);

  return (
    <>
      <section className="grid grid-cols-[minmax(0,1fr)] gap-3">
        <Link href={`/item/${track.slug}`} className="relative block">
          {/* eslint-disable-next-line @next/next/no-img-element -- covers come from many hosts */}
          <img
            src={track.coverUrl}
            alt=""
            className="aspect-square w-full rounded-md border object-cover"
          />
          {offerBuy && track.price && (
            <>
              <span className="bg-surface text-fg border-fg absolute top-2 left-2 rounded-full border px-2.5 py-1 text-[11px] font-bold shadow-[1px_1px_0_0_var(--color-fg)]">
                30 s preview
              </span>
              <span className="bg-primary text-primary-foreground border-fg absolute top-2 right-2 flex items-center rounded-full border-2 px-2.5 py-1 text-[12px] font-bold shadow-[2px_2px_0_0_var(--color-fg)]">
                <Money
                  amount={track.price.bandcoin}
                  currency="BANDCOIN"
                  short
                  className="font-bold"
                  onBrand
                />
              </span>
            </>
          )}
        </Link>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <Link href={`/item/${track.slug}`} className="min-w-0">
            <h3 className="truncate text-base font-bold">{track.title}</h3>
            <p className="text-fg-muted truncate text-[13px]">{track.artistName}</p>
          </Link>
          {offerBuy && track.price && (
            <Link
              href={`/item/${track.slug}#buy`}
              className="bg-primary text-primary-foreground border-fg flex h-9 items-center rounded-none border-2 px-3 text-[13px] font-bold whitespace-nowrap shadow-[3px_3px_0_0_var(--color-fg)] transition-transform hover:-translate-y-0.5"
            >
              Buy now
            </Link>
          )}
        </div>
      </section>
      {queueAhead > 0 && (
        <>
          <RightRule />
          <UpNextList />
        </>
      )}
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
