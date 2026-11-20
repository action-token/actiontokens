"use client";

import {
  ArrowUpRight,
  Box,
  Clapperboard,
  Coins,
  FileText,
  Image as ImageIcon,
  Music,
  Percent,
  Play,
  Shirt,
  Ticket,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import { cn } from "@actiontokens/ui/lib/cn";

import { Money } from "~/components/money";
import { TYPE_LABEL } from "~/lib/item-types";
import type { RouterOutputs } from "~/trpc/react";

import { usePlayer } from "../player/player-store";

/** Column width for poster cards in a carousel. */
export const POSTER_WIDTH = "minmax(176px,204px)";

export type ItemCardData = RouterOutputs["catalog"]["browse"]["items"][number];

const TYPE_ICON: Record<string, LucideIcon> = {
  TRACK: Music,
  VIDEO: Clapperboard,
  IMAGE: ImageIcon,
  MODEL_3D: Box,
  DOCUMENT: FileText,
  ROYALTY: Percent,
  TICKET: Ticket,
  MERCH: Shirt,
  FAN_TOKEN: Coins,
};

/**
 * An item as a poster (after Wadzzo's listing card): the art fills the card,
 * the type sits top-left, the price is a tilted sticker top-right, and the
 * artist and title sit on a dark fade at the bottom. On hover it lifts, tilts
 * and drops a hard shadow in the brand colour. Songs get a Play button.
 */
export function ItemCard({
  item,
  queue,
  className,
}: {
  item: ItemCardData;
  queue?: ItemCardData[];
  className?: string;
}) {
  const playQueue = usePlayer((state) => state.playQueue);
  const TypeIcon = TYPE_ICON[item.type] ?? Box;
  const label = TYPE_LABEL[item.type] ?? item.type;

  const play = () => {
    const playable = (queue ?? [item]).filter((entry) => entry.playable);
    playQueue(
      playable,
      Math.max(
        0,
        playable.findIndex((entry) => entry.id === item.id),
      ),
    );
  };

  return (
    <div
      className={cn(
        "group relative aspect-[3/4] min-w-0 transition-transform duration-200 ease-out hover:-translate-y-1 hover:-rotate-1",
        className,
      )}
    >
      <div className="bg-surface-3 group-hover:border-fg absolute inset-0 overflow-hidden rounded-[1.4rem] border-2 transition-[border-color,box-shadow] duration-200 group-hover:shadow-[6px_7px_0_0_var(--color-primary)]">
        {/* eslint-disable-next-line @next/next/no-img-element -- covers come from many hosts */}
        <img
          src={item.coverUrl}
          alt=""
          loading="lazy"
          className="absolute inset-0 size-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
        />
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-1/4 bg-gradient-to-b from-black/50 to-transparent"
        />
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/90 via-black/55 to-transparent"
        />

        <div className="absolute inset-x-2.5 top-2.5 flex items-start justify-between gap-2">
          <span
            title={label}
            className="grid size-7 place-items-center rounded-full bg-black/45 text-white backdrop-blur"
          >
            <TypeIcon className="size-3.5" />
            <span className="sr-only">{label}</span>
          </span>
          {item.price && (
            <span className="bg-primary text-primary-foreground shrink-0 rotate-3 rounded-lg px-2 py-0.5 text-right transition-transform duration-200 group-hover:scale-105 group-hover:rotate-0">
              <Money
                amount={item.price.bandcoin}
                currency="BANDCOIN"
                short
                onBrand
                className="display text-xl leading-none"
              />
              <span className="block text-[9px] leading-tight font-bold whitespace-nowrap opacity-80">
                ≈ <Money amount={item.price.usd} currency="USD" />
              </span>
            </span>
          )}
        </div>

        <div className="absolute inset-x-0 bottom-0 grid gap-1 p-3 text-white transition-transform duration-200 group-hover:-translate-y-0.5">
          {item.artistSlug ? (
            <Link
              href={`/artist/${item.artistSlug}`}
              className="relative z-10 w-fit max-w-full truncate text-xs font-semibold text-white/80 hover:text-white hover:underline"
            >
              {item.artistName}
            </Link>
          ) : (
            <p className="truncate text-xs font-semibold text-white/80">{item.artistName}</p>
          )}
          <p className="display line-clamp-2 pr-10 text-2xl leading-[1.05] break-words hyphens-auto">
            {item.title}
          </p>
        </div>
      </div>

      <Link
        href={`/item/${item.slug}`}
        className="absolute inset-0 rounded-[1.4rem]"
        aria-label={`${item.title} by ${item.artistName}`}
      />

      {item.playable ? (
        <button
          type="button"
          aria-label={`Play ${item.title}`}
          onClick={play}
          className="bg-primary text-primary-foreground absolute right-3 bottom-3 z-10 grid size-9 place-items-center rounded-full shadow-lg transition-[transform,opacity] duration-200 group-focus-within:opacity-100 group-hover:scale-105 group-hover:opacity-100 [@media(pointer:fine)]:opacity-0"
        >
          <Play className="size-4 translate-x-px fill-current" />
        </button>
      ) : (
        <span
          aria-hidden
          className="bg-primary text-primary-foreground pointer-events-none absolute right-3 bottom-3 grid size-8 translate-y-2 place-items-center rounded-full opacity-0 transition-[transform,opacity] duration-200 group-hover:translate-y-0 group-hover:opacity-100"
        >
          <ArrowUpRight className="size-4" strokeWidth={2.6} />
        </span>
      )}
    </div>
  );
}
