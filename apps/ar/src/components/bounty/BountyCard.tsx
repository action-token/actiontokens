import { FileText, Music, Trophy, Users } from "lucide-react";
import Link from "next/link";

import { cn } from "@actiontokens/ui/lib/cn";

import { ArtistAvatar } from "~/components/artist/ArtistAvatar";
import { PrizeIcon } from "~/components/bounty/PrizeIcon";
import { Skeleton } from "~/components/ui/Skeleton";
import {
  type BountyCard as BountyCardData,
  formatAmount,
  perWinner,
  TONE_CLASS,
  viewerBadge,
} from "~/lib/ar/bounty";
import { currencyLabel } from "~/lib/market";

/**
 * ── BountyCard ─────────────────────────────────────────────────────────────
 *
 * A bounty in a list. Reads top to bottom in the order a fan decides: who's
 * asking, what it pays, how many can win, how busy it is — and, in the
 * corner, where you already stand on it.
 */
export function BountyCard({ bounty }: { bounty: BountyCardData }) {
  const badge = viewerBadge(bounty);
  const art = bounty.musicArt
    .map((track) => track.albumArtUrl)
    .filter((url): url is string => Boolean(url));
  const cover = art[0] ?? bounty.artist.avatarUrl;

  return (
    <Link
      href={`/bounty/${bounty.id}`}
      className="ar-bevel group rounded-ar-lg relative block overflow-hidden"
    >
      <div className="relative h-[112px] overflow-hidden">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="ar-grid from-ar-accent/20 via-ar-surface to-ar-surface h-full w-full bg-linear-to-br" />
        )}
        <div className="from-ar-surface via-ar-surface/30 absolute inset-0 bg-linear-to-t to-transparent" />

        <span
          className={cn(
            "font-hud absolute top-2.5 right-2.5 inline-flex h-[22px] items-center rounded-md border-2 px-2 text-[10px] font-semibold tracking-[0.12em] uppercase shadow-[2px_2px_0_0_hsl(var(--st-ink))]",
            TONE_CLASS[badge.tone],
          )}
        >
          {badge.label}
        </span>
        {art.length > 0 && (
          <span className="font-hud bg-ar-surface text-ar-text absolute top-2.5 left-2.5 inline-flex h-[22px] items-center gap-1 rounded-md border-2 border-[hsl(var(--st-line)/0.7)] px-2 text-[10px] font-semibold tracking-[0.12em] uppercase">
            <Music size={10} strokeWidth={2.6} /> Listening
          </span>
        )}
      </div>

      <div className="relative -mt-7 px-3.5 pb-3.5">
        <div className="flex items-end gap-2">
          <ArtistAvatar
            src={bounty.artist.avatarUrl}
            className="ring-ar-surface h-9 w-9 rounded-[11px] ring-2"
          />
          <span className="font-hud text-ar-dim mb-0.5 truncate text-[10.5px] font-semibold tracking-[0.12em] uppercase">
            {bounty.artist.name}
          </span>
        </div>

        <p className="text-ar-text mt-2 line-clamp-2 text-[15px] leading-snug font-semibold">
          {bounty.title}
        </p>

        <div className="mt-2.5 flex items-end justify-between gap-3">
          <div>
            <p className="font-hud text-glow-soft text-ar-accent-hot flex items-center gap-1.5 text-[20px] leading-none font-bold tabular-nums">
              <PrizeIcon prize={bounty.prize} className="size-[0.85em]" />
              {formatAmount(bounty.prize.amount)}
            </p>
            <p className="font-hud text-ar-faint mt-1 text-[10px] font-semibold tabular-nums">
              {bounty.maxWinners > 1
                ? `${formatAmount(perWinner(bounty))} ${currencyLabel(bounty.prize.code)} per winner`
                : `${currencyLabel(bounty.prize.code)} prize pool`}
            </p>
          </div>

          <div className="font-hud text-ar-dim flex flex-col items-end gap-1 text-[10px] font-semibold tabular-nums">
            <span className="flex items-center gap-1">
              <Trophy size={10} strokeWidth={2.6} />
              {bounty.winners}/{bounty.maxWinners} won
            </span>
            <span className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <Users size={10} strokeWidth={2.6} />
                {bounty.participants}
              </span>
              <span className="flex items-center gap-1">
                <FileText size={10} strokeWidth={2.6} />
                {bounty.submissions}
              </span>
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

/** Same footprint as `BountyCard`, so the list doesn't jump when data lands. */
export function BountyCardSkeleton() {
  return (
    <div className="ar-bevel rounded-ar-lg overflow-hidden">
      <Skeleton className="h-[112px] w-full" rounded="rounded-none" />
      <div className="px-3.5 pt-2 pb-3.5">
        <Skeleton rounded="rounded-full" className="h-2.5 w-1/3" />
        <Skeleton rounded="rounded-full" className="mt-3 h-3.5 w-4/5" />
        <div className="mt-3 flex items-end justify-between">
          <Skeleton rounded="rounded-full" className="h-5 w-20" />
          <Skeleton rounded="rounded-full" className="h-2.5 w-24" />
        </div>
      </div>
    </div>
  );
}
