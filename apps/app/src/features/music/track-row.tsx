"use client";

import { Pause, Play } from "lucide-react";
import Link from "next/link";

import { cn } from "@bandcoin/ui/lib/cn";

import { Money } from "~/components/money";

import type { ItemCardData } from "../catalog/item-card";
import { currentTrack, usePlayer } from "../player/player-store";

const clock = (seconds: number | null) =>
  seconds === null ? "" : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/**
 * A song in a list. Tapping the row plays it (and queues the rest of the
 * list); the title links to the item page.
 */
export function TrackRow({
  track,
  position,
  list,
  badge,
}: {
  track: ItemCardData;
  position: number;
  list: ItemCardData[];
  badge?: string;
}) {
  const { playQueue, toggle } = usePlayer();
  const isCurrent = usePlayer((state) => currentTrack(state)?.id === track.id);
  const playing = usePlayer((state) => state.playing);

  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        aria-label={`Play ${track.title}`}
        onClick={() => (isCurrent ? toggle() : playQueue(list, position))}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (isCurrent) toggle();
            else playQueue(list, position);
          }
        }}
        className={cn(
          "hover:bg-surface-2 group grid cursor-pointer grid-cols-[28px_44px_minmax(0,1fr)_auto] items-center gap-3 rounded-md px-2 py-2 sm:grid-cols-[28px_44px_minmax(0,1fr)_auto_64px]",
          isCurrent && "bg-primary-soft",
        )}
      >
        <span className="num text-fg-faint grid place-items-center text-xs">
          {isCurrent && playing ? (
            <Pause className="text-primary-text size-4 fill-current" />
          ) : (
            <>
              <span className="group-hover:hidden">{position + 1}</span>
              <Play className="hidden size-4 fill-current group-hover:block" />
            </>
          )}
        </span>
        {/* eslint-disable-next-line @next/next/no-img-element -- covers come from many hosts */}
        <img src={track.coverUrl} alt="" loading="lazy" className="size-11 rounded-sm object-cover" />
        <div className="min-w-0">
          <Link
            href={`/item/${track.slug}`}
            onClick={(event) => event.stopPropagation()}
            className={cn("inline-block max-w-full truncate align-top text-sm font-semibold hover:underline", isCurrent && "text-primary-text")}
          >
            {track.title}
          </Link>
          <span className="text-fg-muted block truncate text-xs">
            {track.artistName}
            {badge && <span className="bg-surface-3 text-fg ml-2 rounded-full px-1.5 py-px text-[10px] font-semibold">{badge}</span>}
          </span>
        </div>
        <span className="num text-fg-muted text-xs">
          {track.price && <Money amount={track.price.bandcoin} currency="BANDCOIN" />}
        </span>
        <span className="num text-fg-faint hidden text-right text-xs sm:block">{clock(track.durationSec)}</span>
      </div>
    </li>
  );
}
