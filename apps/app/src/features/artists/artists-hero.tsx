"use client";

import { BadgeCheck, Crown, Disc3, FileText, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { cn } from "@actiontokens/ui/lib/cn";
import { Avatar } from "@actiontokens/ui/patterns/person";

import {
  HERO_IMAGE,
  HeroCarousel,
  HeroCarouselSkeleton,
  HeroShare,
  HeroSlide,
  HeroStat,
} from "~/components/hero-carousel";
import { api, type RouterOutputs } from "~/trpc/react";

import { FollowSubscribe } from "../artist/follow-subscribe";
import { compact, PlayArtist } from "./artist-circle";

type Artist = RouterOutputs["artist"]["directory"]["artists"][number];

export const HERO_COUNT = 3;

/**
 * The top three most followed artists across the full width: their cover behind, the
 * round avatar on the left, everything else centred. Play, Follow and Subscribe on each.
 */
export function ArtistsHero() {
  const top = api.artist.directory.useQuery(
    { sort: "popular", limit: HERO_COUNT },
    { staleTime: 60_000 },
  );
  if (top.isPending) return <HeroCarouselSkeleton />;
  const artists = top.data?.artists ?? [];
  if (artists.length === 0) return null;
  return (
    <HeroCarousel
      label="Top artists"
      items={artists}
      keyOf={(artist) => artist.id}
      nameOf={(artist) => artist.name}
      // Their cover; never the avatar (that's the round picture).
      backgroundOf={(artist) => artist.coverUrl}
      renderSlide={(artist, index) => <Slide artist={artist} rank={index + 1} />}
    />
  );
}

function Slide({ artist, rank }: { artist: Artist; rank: number }) {
  const [followers, setFollowers] = useState(artist.followers);
  const href = `/artist/${artist.slug}`;
  const live = artist.liveStories > 0;

  return (
    <HeroSlide
      href={href}
      ringed={live}
      tag={live ? "live now!" : `#${rank} artist!`}
      image={
        artist.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- avatars come from many hosts
          <img
            src={artist.avatarUrl}
            alt={artist.name}
            className={cn(HERO_IMAGE, "bg-surface object-cover")}
          />
        ) : (
          <Avatar name={artist.name} className={cn(HERO_IMAGE, "text-7xl md:text-8xl")} />
        )
      }
    >
      <div className="grid justify-items-center gap-2">
        <p className="marker text-fg-muted flex -rotate-2 items-center gap-1.5 text-lg">
          {rank === 1 && <Crown className="text-primary-text size-4" strokeWidth={2.6} />}*#{rank}{" "}
          most followed on Bandcoin*
        </p>
        <h2 className="display flex max-w-full min-w-0 items-center justify-center gap-3 text-5xl sm:text-6xl">
          <Link href={href} className="min-w-0 truncate hover:underline">
            {artist.name}
          </Link>
          <BadgeCheck className="text-primary size-8 shrink-0 sm:size-10" strokeWidth={2.6} />
        </h2>
        <p className="text-fg-muted line-clamp-2 max-w-xl text-[15px]">
          {artist.bio?.trim() ? artist.bio : "Shares music, art and drops on Bandcoin."}
        </p>
      </div>

      <ul className="flex flex-wrap items-center justify-center gap-2" aria-label="Counts">
        <HeroStat icon={Users} value={compact(followers)} label="fans" />
        <HeroStat icon={Disc3} value={compact(artist.songs)} label="releases" />
        <HeroStat icon={FileText} value={compact(artist.posts)} label="posts" />
        {artist.tokenCode && (
          <li className="marker bg-primary text-primary-foreground ml-1 -rotate-2 rounded-lg px-2.5 py-1 text-base">
            ${artist.tokenCode}
          </li>
        )}
      </ul>

      <div className="flex flex-wrap items-center justify-center gap-3">
        {artist.songs > 0 && <PlayArtist slug={artist.slug} name={artist.name} size="pill" />}
        <FollowSubscribe
          size="md"
          slug={artist.slug}
          initialFollowing={artist.following}
          initialSubscribed={artist.subscribed}
          token={artist.tokenCode ? { code: artist.tokenCode, organizationId: artist.id } : null}
          onFollowers={setFollowers}
          onJoined={() => setFollowers((current) => current + 1)}
        />
        <HeroShare name={artist.name} href={href} />
      </div>
    </HeroSlide>
  );
}
