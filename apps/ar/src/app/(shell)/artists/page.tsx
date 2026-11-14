"use client";

import { BadgeCheck, MapPin, Search, Users, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { AppShell, ScreenHeader } from "~/components/shell/AppShell";
import { ArButton } from "~/components/ui/ArButton";
import { SegmentedTabs } from "~/components/ui/SegmentedTabs";
import { useAuth } from "~/lib/ar/store";
import type { ArArtist } from "@bandcoin/ar-core/ar/types";
import { ArtistRowSkeleton } from "~/components/ui/Skeleton";
import { useArtistsQuery, useToggleFollow } from "~/lib/ar/usePins";
import { ArtistAvatar } from "~/components/artist/ArtistAvatar";
import { SubscribeSheet } from "~/components/artist/SubscribeSheet";

const compact = (n: number) =>
  n >= 1_000 ? `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n);

/**
 * ── /artists ────────────────────────────────────────────────────────────────
 *
 * Who's putting drops out there. Browsable signed out — the follow button is
 * the only thing behind the gate — because "which artists are near me" is a
 * perfectly good reason to open the app before ever making an account.
 *
 * Following isn't cosmetic here: it's the switch that puts an artist's
 * follower-only pins on your map, which is why the button is the loudest
 * thing on each row.
 */
export default function ArtistsScreen() {
  const { artists, isLoading: artistsLoading } = useArtistsQuery();
  const {
    toggle: toggleFollow,
    pendingId: followPendingId,
    labelFor: followLabel,
    error: followError,
  } = useToggleFollow();
  const requireAuth = useAuth((s) => s.requireAuth);
  /** The artist the Subscribe sheet is for; it stays set while the sheet closes */
  const [subscribingTo, setSubscribingTo] = useState<ArArtist | null>(null);
  const [subscribing, setSubscribing] = useState(false);

  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"all" | "following">("all");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return artists.filter((b) => {
      if (tab === "following" && !b.followed) return false;
      if (!q) return true;
      return (
        b.name.toLowerCase().includes(q) ||
        b.handle.toLowerCase().includes(q) ||
        (b.tagline ?? b.bio).toLowerCase().includes(q) ||
        b.categories.some((c) => c.toLowerCase().includes(q))
      );
    });
  }, [artists, query, tab]);

  const followingCount = artists.filter((b) => b.followed).length;

  return (
    <AppShell>
      <div className="flex h-full flex-col">
        <ScreenHeader eyebrow="Who's dropping" title="Artists" />

        {/* ── Search ───────────────────────────────────────────────── */}
        <div className="px-5">
          <div className="ar-bevel rounded-ar flex h-11 items-center gap-2.5 px-3.5">
            <Search size={15} strokeWidth={2.2} className="text-ar-faint shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search artists"
              aria-label="Search artists"
              className="text-ar-text placeholder:text-ar-faint min-w-0 flex-1 bg-transparent text-[13px] outline-hidden"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="text-ar-faint hover:text-ar-text shrink-0"
              >
                <X size={15} strokeWidth={2.4} />
              </button>
            )}
          </div>
        </div>

        {/* ── Segments ─────────────────────────────────────────────── */}
        <SegmentedTabs
          layoutId="artist-list-tabs"
          value={tab}
          onChange={setTab}
          className="mx-5 mt-3"
          tabs={[
            { id: "all", label: "All", count: artists.length },
            {
              id: "following",
              label: "Following",
              count: followingCount,
              icon: Users,
            },
          ]}
        />

        {/* ── List ─────────────────────────────────────────────────── */}
        {/* A failed follow is otherwise silent — the button just returns to
            "Follow" and the user is left guessing whether they mis-tapped. */}
        {followError && (
          <div className="rounded-ar border-ar-danger/40 bg-ar-danger/10 mx-5 mt-3 border px-3.5 py-2.5">
            <p className="text-ar-danger text-[12px] leading-relaxed">{followError}</p>
          </div>
        )}

        <div className="ar-scroll mt-3.5 flex-1 space-y-3 px-5 pb-6">
          {/* Placeholder rows while the first fetch is in flight — the list
              keeps its shape instead of collapsing to the empty state and
              then jumping back open. */}
          {artistsLoading &&
            Array.from({ length: 5 }).map((_, i) => <ArtistRowSkeleton key={`skeleton-${i}`} />)}

          {shown.map((artist) => (
            <ArtistRow
              key={artist.id}
              artist={artist}
              busy={followPendingId === artist.id}
              label={
                artist.subscribed && followPendingId !== artist.id
                  ? "Subscribed"
                  : followLabel(artist)
              }
              onSubscribe={() => {
                if (!requireAuth("follow")) return;
                setSubscribingTo(artist);
                setSubscribing(true);
              }}
              onToggle={() => {
                if (!requireAuth("follow")) return;
                toggleFollow(artist);
              }}
            />
          ))}

          {!artistsLoading && shown.length === 0 && (
            <div className="py-16 text-center">
              <p className="font-hud text-ar-dim text-[13px] font-bold tracking-[0.14em] uppercase">
                No artists here
              </p>
              <p className="text-ar-faint mx-auto mt-1.5 max-w-[16rem] text-[12.5px] leading-relaxed">
                {tab === "following"
                  ? "Follow an artist and their follower-only pins start showing up on your map."
                  : "Nothing matches that search."}
              </p>
            </div>
          )}
        </div>
      </div>

      {subscribingTo?.fanToken && (
        <SubscribeSheet
          open={subscribing}
          onClose={() => setSubscribing(false)}
          artistId={subscribingTo.id}
          artistName={subscribingTo.name}
          code={subscribingTo.fanToken}
        />
      )}
    </AppShell>
  );
}

function ArtistRow({
  artist,
  onToggle,
  onSubscribe,
  busy = false,
  label,
}: {
  artist: ArArtist;
  onToggle: () => void;
  /** Opens the Subscribe sheet (shown once they follow, when the artist has a fan token) */
  onSubscribe: () => void;
  /** This artist's follow is in flight — other rows stay live. */
  busy?: boolean;
  /** Carries the phase text while busy ("Approve in wallet", …). */
  label: string;
}) {
  return (
    <div className="ar-bevel rounded-ar relative overflow-hidden">
      {/* Cover bleed behind the row — artist identity without a whole hero. */}
      <div className="absolute inset-0">
        {}
        {artist.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={artist.coverUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover opacity-[0.14]"
          />
        )}
        <div className="via-ar-surface/92 from-ar-surface to-ar-surface/70 absolute inset-0 bg-linear-to-r" />
      </div>

      <div className="relative flex items-center gap-3 p-3">
        <Link href={`/artists/${artist.id}`} className="shrink-0">
          <ArtistAvatar
            src={artist.avatarUrl}
            className="h-[52px] w-[52px] rounded-[14px] ring-1 ring-white/15"
          />
        </Link>

        <Link href={`/artists/${artist.id}`} className="min-w-0 flex-1">
          <p className="text-ar-text flex items-center gap-1 text-[14px] leading-tight font-semibold">
            <span className="truncate">{artist.name}</span>
            {artist.verified && (
              <BadgeCheck
                size={14}
                strokeWidth={2.4}
                className="text-ar-accent-hot shrink-0"
                aria-label="Verified"
              />
            )}
          </p>
          {(artist.tagline ?? artist.bio) && (
            <p className="text-ar-faint mt-0.5 truncate text-[11.5px]">
              {artist.tagline ?? artist.bio}
            </p>
          )}
          <p className="font-hud text-ar-dim mt-1.5 flex items-center gap-3 text-[10px] font-semibold tabular-nums">
            <span className="flex items-center gap-1">
              <Users size={10} strokeWidth={2.6} />
              {compact(artist.followers)}
            </span>
            <span className="flex items-center gap-1">
              <MapPin size={10} strokeWidth={2.6} />
              {artist.pinCount} live
            </span>
            {artist.region && <span className="text-ar-faint truncate">{artist.region}</span>}
          </p>
        </Link>

        <div className="flex shrink-0 flex-col gap-1.5">
          <ArButton
            size="sm"
            variant={artist.followed ? "outline" : "primary"}
            onClick={onToggle}
            busy={busy}
            className="min-w-[92px]"
          >
            {label}
          </ArButton>
          {/* As on the artist's page: Subscribe once they follow, when there's a fan token. */}
          {artist.followed && !artist.subscribed && artist.fanToken && (
            <ArButton size="sm" variant="primary" onClick={onSubscribe} className="min-w-[92px]">
              Subscribe
            </ArButton>
          )}
        </div>
      </div>
    </div>
  );
}
