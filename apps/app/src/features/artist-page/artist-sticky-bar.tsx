"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@bandcoin/ui/lib/cn";

import { FollowButton } from "../artist/follow-button";
import type { ItemCardData } from "../catalog/item-card";
import { currentTrack, usePlayer } from "../player/player-store";

/**
 * Once the artist's cover scrolls away, a slim bar slides in at the top with Play, their
 * name and Follow / Subscribe (like a streaming app), on a blurred strip of their cover.
 * Like the cover it runs from the screen edge, under the floating sidebar. It watches the
 * element just before it (the cover) and stays out of the way while that is on screen.
 * Follow shares its state with the cover's (`ArtistStandingProvider`).
 */
export function ArtistStickyBar({
  slug,
  name,
  avatarUrl,
  bannerUrl,
  token,
  songs,
}: {
  slug: string;
  name: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  token: { code: string; artistId: string } | null;
  songs: ItemCardData[];
}) {
  const marker = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(false);
  const { playQueue, toggle } = usePlayer();
  const ours = usePlayer((state) => {
    const track = currentTrack(state);
    return track !== null && track !== undefined && songs.some((song) => song.id === track.id);
  });
  const playing = usePlayer((state) => state.playing) && ours;

  useEffect(() => {
    const cover = marker.current?.previousElementSibling;
    if (!cover) return;
    const observer = new IntersectionObserver(
      ([entry]) => setShown(entry ? !entry.isIntersecting : false),
      // Show it a little before the cover is fully gone.
      { rootMargin: "-120px 0px 0px 0px" },
    );
    observer.observe(cover);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <span ref={marker} hidden />
      <div
        aria-hidden={!shown}
        className={cn(
          // Phones: under the app's top bar. Wider: from the screen edge, behind the sidebar.
          "fixed inset-x-0 top-16 isolate z-30 flex h-16 items-center gap-3 overflow-hidden px-4 text-white shadow-lg transition-[transform,opacity] duration-300 sm:top-0 sm:h-18 sm:pr-8 sm:pl-[calc(var(--side-w)+2rem)] xl:in-data-right-rail:right-(--right-w) xl:in-data-right-rail:transition-[transform,opacity,right]",
          shown ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-full opacity-0",
        )}
      >
        {bannerUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- images come from many hosts
          <img
            src={bannerUrl}
            alt=""
            aria-hidden
            className="absolute inset-0 -z-20 size-full scale-110 object-cover blur-xl"
          />
        ) : (
          <div aria-hidden className="bg-primary absolute inset-0 -z-20" />
        )}
        <div aria-hidden className="absolute inset-0 -z-10 bg-black/55" />
        {songs.length > 0 && (
          <button
            type="button"
            tabIndex={shown ? 0 : -1}
            aria-label={playing ? `Pause ${name}` : `Play ${name}`}
            onClick={() => (ours ? toggle() : playQueue(songs))}
            className="bg-primary text-primary-foreground grid size-10 shrink-0 place-items-center rounded-full shadow-md transition-transform hover:scale-105"
          >
            {playing ? (
              <Pause className="size-4 fill-current" />
            ) : (
              <Play className="size-4 translate-x-px fill-current" />
            )}
          </button>
        )}
        {avatarUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- avatars come from many hosts
          <img
            src={avatarUrl}
            alt=""
            className="size-9 shrink-0 rounded-full border-2 border-white object-cover"
          />
        )}
        <b className="display min-w-0 flex-1 truncate text-2xl sm:text-3xl">{name}</b>
        <div className="flex shrink-0 items-center gap-2" inert={!shown}>
          <FollowButton onDark compact slug={slug} initial={false} token={token} />
        </div>
      </div>
    </>
  );
}
