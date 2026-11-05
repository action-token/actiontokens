"use client";

import { BadgeCheck, Disc3, FileText, Mic2, Share2, Users } from "lucide-react";
import Link from "next/link";
import toast from "react-hot-toast";

import { cn } from "@bandcoin/ui/lib/cn";

import type { RouterOutputs } from "~/trpc/react";

import { FollowButton } from "../artist/follow-button";
import { Avatar } from "../shell/context-panel";

export type ArtistCardData = RouterOutputs["artist"]["directory"]["artists"][number];

const AVATAR =
  "bg-surface-3 grid size-16 shrink-0 place-items-center rounded-full object-cover text-lg font-bold";

const count = (value: number) =>
  value >= 10_000 ? `${(value / 1000).toFixed(0)}k` : value.toLocaleString("en-US");

/**
 * An artist as a poster: the cover fills the card, with a "Story" badge while
 * they have a live story, their fan token's code, and a frosted panel with the
 * avatar, name, bio, three counts, Follow and Share. The whole card opens the
 * artist's page; the buttons sit above that link.
 */
export function ArtistCard({ artist, className }: { artist: ArtistCardData; className?: string }) {
  const href = `/artist/${artist.slug}`;
  const picture = artist.coverUrl ?? artist.avatarUrl;

  const share = async () => {
    const url = new URL(href, window.location.origin).toString();
    if (navigator.share) await navigator.share({ title: artist.name, url }).catch(() => undefined);
    else {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    }
  };

  return (
    <article
      className={cn(
        "group bg-surface-3 hover:border-fg relative isolate flex min-h-[24rem] flex-col overflow-hidden rounded-[1.4rem] border-2 text-white transition-[transform,border-color,box-shadow] duration-200 ease-out hover:-translate-y-1 hover:shadow-[6px_7px_0_0_var(--color-primary)]",
        className,
      )}
    >
      {picture ? (
        // eslint-disable-next-line @next/next/no-img-element -- covers come from many hosts
        <img
          src={picture}
          alt=""
          loading="lazy"
          className="absolute inset-0 -z-10 size-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      ) : (
        <div className="bg-primary/25 absolute inset-0 -z-10 grid place-items-center">
          <Mic2 className="text-primary/50 size-24" strokeWidth={1.6} />
        </div>
      )}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 -z-10 h-1/4 bg-gradient-to-b from-black/55 to-transparent"
      />
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 -z-10 h-3/5 bg-gradient-to-t from-black/90 via-black/50 to-transparent"
      />

      <div className="flex items-start justify-between gap-2 p-3">
        {artist.liveStories > 0 ? (
          <span className="bg-primary text-primary-foreground inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold">
            <span className="relative flex size-2">
              <span className="bg-primary-foreground absolute inline-flex size-full animate-ping rounded-full opacity-60" />
              <span className="bg-primary-foreground relative inline-flex size-2 rounded-full" />
            </span>
            Story
          </span>
        ) : (
          <span />
        )}
        {artist.tokenCode && (
          <span className="marker bg-surface text-fg shrink-0 rotate-3 rounded-md px-2 py-0.5 text-xs">
            ${artist.tokenCode}
          </span>
        )}
      </div>

      <div className="mt-auto grid gap-3 p-3">
        <div className="grid gap-3 rounded-2xl border border-white/15 bg-black/35 p-3 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "shrink-0 rounded-full ring-2 ring-offset-2 ring-offset-black/40",
                artist.liveStories > 0 ? "ring-primary" : "ring-white/25",
              )}
            >
              <Avatar name={artist.name} url={artist.avatarUrl} className={AVATAR} />
            </span>
            <div className="min-w-0">
              <h3 className="display flex items-center gap-1.5 text-3xl leading-none">
                <Link
                  href={href}
                  className="min-w-0 truncate after:absolute after:inset-0 focus-visible:outline-none"
                >
                  {artist.name}
                </Link>
                <BadgeCheck className="text-primary size-5 shrink-0" strokeWidth={2.6} />
              </h3>
              <p className="mt-1 line-clamp-2 text-xs leading-snug text-white/75">
                {artist.bio?.trim() ? artist.bio : "Shares music, art and drops on Bandcoin."}
              </p>
            </div>
          </div>

          <ul className="flex flex-wrap gap-1.5 text-[11px] font-semibold" aria-label="Counts">
            <Stat icon={Users} value={artist.followers} label="fans" />
            <Stat icon={Disc3} value={artist.songs} label="releases" />
            <Stat icon={FileText} value={artist.posts} label="posts" />
          </ul>

          <div className="relative z-10 flex items-center gap-2">
            <FollowButton compact slug={artist.slug} initial={artist.following} />
            <button
              type="button"
              onClick={() => void share()}
              aria-label={`Share ${artist.name}`}
              className="grid size-8 place-items-center rounded-full bg-white text-black transition-transform hover:-rotate-12"
            >
              <Share2 className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

function Stat({ icon: Icon, value, label }: { icon: typeof Users; value: number; label: string }) {
  return (
    <li className="inline-flex items-center gap-1.5 rounded-full bg-white/12 px-2.5 py-1">
      <Icon className="size-3.5 text-white/70" />
      <b className="display text-lg">{count(value)}</b>
      <span className="text-white/70">{label}</span>
    </li>
  );
}
