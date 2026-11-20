"use client";

import { BadgeCheck, Loader2, Play } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import toast from "react-hot-toast";

import { cn } from "@actiontokens/ui/lib/cn";
import { Avatar } from "@actiontokens/ui/patterns/person";

import { api } from "~/trpc/react";

import { usePlayer } from "../player/player-store";

export const compact = (count: number) =>
  count.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 });

const plural = (count: number, word: string) =>
  `${compact(count)} ${word}${count === 1 ? "" : "s"}`;

export type CircleArtist = {
  name: string;
  slug: string;
  avatarUrl: string | null;
  followers: number;
  /** Releases; with none, there's no Play button. */
  songs?: number;
  /** A live story: accent ring and a LIVE tag. */
  liveStories?: number;
  /** Their fan token's code, as a sticker. */
  tokenCode?: string | null;
};

/**
 * An artist as a circle (Spotify's artist card, Bandcoin's stickers): round photo with a
 * live-story ring and fan-token sticker, a Play button for their top songs, name and counts.
 * The whole card opens the artist's page; `actions` (Follow, Subscribe) sit above that link.
 */
export function ArtistCircle({ artist, actions }: { artist: CircleArtist; actions?: ReactNode }) {
  const live = (artist.liveStories ?? 0) > 0;
  const counts = [
    plural(artist.followers, "follower"),
    artist.songs ? plural(artist.songs, "release") : null,
  ].filter(Boolean);

  return (
    <div className="group hover:bg-surface-2 focus-within:bg-surface-2 relative grid min-w-0 content-start justify-items-center gap-1.5 rounded-2xl p-2.5 pb-3 text-center transition-colors">
      <div className="relative w-full">
        <div
          className={cn(
            "rounded-full p-[3px] transition-transform duration-250 group-hover:-translate-y-0.5",
            live ? "bg-primary" : "bg-transparent",
          )}
        >
          <Avatar
            src={artist.avatarUrl}
            name={artist.name}
            className={cn(
              "aspect-square size-auto w-full text-5xl shadow-lg",
              live && "ring-bg ring-[3px]",
            )}
          />
        </div>
        {live && (
          <span className="bg-primary text-primary-foreground absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/3 rounded-full px-2 py-0.5 text-[10px] font-extrabold tracking-wider">
            LIVE
          </span>
        )}
        {artist.tokenCode && (
          <span className="marker bg-surface text-fg absolute top-1 right-0 rotate-6 rounded-md border px-1.5 py-0.5 text-[11px] shadow-sm">
            ${artist.tokenCode}
          </span>
        )}
        {artist.songs !== 0 && <PlayArtist slug={artist.slug} name={artist.name} />}
      </div>

      <Link
        href={`/artist/${artist.slug}`}
        className="mt-1.5 flex w-full min-w-0 items-center justify-center gap-1 after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none"
      >
        <span className="display truncate text-lg leading-tight">{artist.name}</span>
        <BadgeCheck
          className="text-primary size-4 shrink-0"
          strokeWidth={2.6}
          aria-label="Verified"
        />
      </Link>
      <span className="text-fg-muted -mt-1 w-full truncate text-xs">{counts.join(" · ")}</span>
      {actions && (
        <div className="relative z-10 mt-1 flex flex-wrap justify-center gap-1.5">{actions}</div>
      )}
    </div>
  );
}

/** Plays the artist's most played songs. Shows on hover with a mouse, always on touch screens. */
export function PlayArtist({
  slug,
  name,
  className,
  size = "sm",
}: {
  slug: string;
  name: string;
  className?: string;
  /** sm: round, on a circle card. lg: a bigger round button. pill: a chunky "Play" button, like Home's hero. */
  size?: "sm" | "lg" | "pill";
}) {
  const utils = api.useUtils();
  const playQueue = usePlayer((state) => state.playQueue);
  const [loading, setLoading] = useState(false);

  const play = async () => {
    setLoading(true);
    try {
      const tracks = await utils.artist.topTracks.fetch({ slug });
      if (tracks.length === 0) toast(`${name} hasn't released any songs yet.`);
      else playQueue(tracks);
    } catch {
      toast.error("Couldn't load their songs. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void play()}
      disabled={loading}
      aria-label={`Play ${name}`}
      title={`Play ${name}'s top songs`}
      className={cn(
        "bg-primary text-primary-foreground transition-[opacity,transform] duration-200 active:scale-95",
        size === "pill"
          ? "inline-flex h-12 -rotate-1 items-center gap-2 rounded-2xl px-6 hover:scale-[1.03] hover:rotate-0 disabled:opacity-70"
          : "grid place-items-center rounded-full shadow-[0_8px_18px_-6px_rgb(0_0_0/0.6)] hover:scale-105",
        size === "sm" &&
          "absolute right-1 bottom-1 z-10 size-11 translate-y-2 opacity-0 group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:translate-y-0 group-hover:opacity-100 [@media(pointer:coarse)]:translate-y-0 [@media(pointer:coarse)]:opacity-100",
        size === "lg" && "size-14",
        loading && "translate-y-0 opacity-100",
        className,
      )}
    >
      {loading ? (
        <Loader2 className="size-5 animate-spin" />
      ) : (
        <Play
          className={cn(
            "fill-current",
            size === "sm" && "size-5 translate-x-px",
            size === "lg" && "size-6 translate-x-px",
            size === "pill" && "size-5",
          )}
        />
      )}
      {size === "pill" && <span className="marker text-lg">Play top songs</span>}
    </button>
  );
}
