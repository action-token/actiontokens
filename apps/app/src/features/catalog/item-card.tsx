"use client";

import { Play } from "lucide-react";
import Link from "next/link";

import { cn } from "@bandcoin/ui/lib/cn";

import { Money } from "~/components/money";
import { TYPE_LABEL } from "~/lib/item-types";
import type { RouterOutputs } from "~/trpc/react";

import { usePlayer } from "../player/player-store";

export type ItemCardData = RouterOutputs["catalog"]["browse"]["items"][number];


/** The card in every carousel and grid: cover (with Play for songs), title, artist, price. */
export function ItemCard({ item, queue, className }: { item: ItemCardData; queue?: ItemCardData[]; className?: string }) {
  const playQueue = usePlayer((state) => state.playQueue);
  const play = () => {
    const playable = (queue ?? [item]).filter((entry) => entry.playable);
    playQueue(playable, Math.max(0, playable.findIndex((entry) => entry.id === item.id)));
  };

  return (
    <div className={cn("group relative grid min-w-0 gap-2", className)}>
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element -- covers come from many hosts */}
        <img
          src={item.coverUrl}
          alt=""
          loading="lazy"
          className="bg-surface-2 aspect-square w-full rounded-md border object-cover transition-transform duration-250 group-hover:-translate-y-[3px]"
        />
        {item.playable && (
          <button
            type="button"
            aria-label={`Play ${item.title}`}
            onClick={play}
            className="bg-primary text-primary-foreground absolute right-2.5 bottom-2.5 z-10 grid size-10 translate-y-1.5 place-items-center rounded-full opacity-0 shadow-lg transition-all duration-250 group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:translate-y-0 group-hover:opacity-100"
          >
            <Play className="size-4 fill-current" />
          </button>
        )}
        {!item.playable && (
          <span className="bg-bg/80 absolute top-2 left-2 rounded-full px-2 py-0.5 text-[11px] font-semibold backdrop-blur">
            {TYPE_LABEL[item.type] ?? item.type}
          </span>
        )}
      </div>
      <Link href={`/item/${item.slug}`} className="truncate text-sm font-semibold after:absolute after:inset-0 after:content-['']">
        {item.title}
      </Link>
      <div className="text-fg-muted -mt-1.5 flex justify-between gap-2 text-[13px]">
        <span className="truncate">{item.artistName}</span>
        {item.price && <Money amount={item.price.bandcoin} currency="BANDCOIN" className="text-fg shrink-0 text-xs" />}
      </div>
    </div>
  );
}
