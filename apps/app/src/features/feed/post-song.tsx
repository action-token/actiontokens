"use client";

import { Music, Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@actiontokens/ui/lib/cn";

import { usePlayer } from "../player/player-store";
import { clock } from "./media-layout";
import type { FeedPost } from "./post-card";

/** Only one post song plays at a time, and never over the player bar. */
let playingNow: HTMLAudioElement | null = null;

/** A song in a post, as a small player: cover, play, title, seek bar and time. */
export function PostSong({ file, post }: { file: FeedPost["media"][number]; post: FeedPost }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(0);
  const [length, setLength] = useState(0);
  const pausePlayer = usePlayer((state) => state.setPlaying);
  const cover = file.thumbnailUrl ?? post.organization.avatarUrl;

  useEffect(() => {
    const element = audio.current;
    return () => {
      if (playingNow === element) playingNow = null;
    };
  }, []);

  function toggle() {
    const element = audio.current;
    if (!element) return;
    if (!element.paused) return element.pause();
    if (playingNow && playingNow !== element) playingNow.pause();
    playingNow = element;
    pausePlayer(false);
    void element.play();
  }

  return (
    <div
      className={cn(
        "bg-surface-2 flex items-center gap-3 rounded-xl border p-2.5 pr-4 transition-colors",
        playing && "border-primary/50",
      )}
    >
      <div className="relative size-14 shrink-0 overflow-hidden rounded-lg">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element -- uploads come from the bucket
          <img src={cover} alt="" className="size-full object-cover" />
        ) : (
          <span className="from-primary/70 to-primary-soft grid size-full place-items-center bg-gradient-to-br">
            <Music className="size-6 text-white" />
          </span>
        )}
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? `Pause ${file.title ?? "song"}` : `Play ${file.title ?? "song"}`}
          className="absolute inset-0 grid place-items-center bg-black/35 text-white transition-colors hover:bg-black/50"
        >
          {playing ? (
            <Pause className="size-6 fill-current" />
          ) : (
            <Play className="size-6 translate-x-px fill-current" />
          )}
        </button>
      </div>
      <div className="grid min-w-0 flex-1 gap-1">
        <p className="truncate text-sm font-semibold">{file.title ?? "Untitled song"}</p>
        <p className="text-fg-muted truncate text-xs">{post.organization.name}</p>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={length || 0}
            step={0.1}
            value={at}
            aria-label="Seek"
            disabled={!length}
            onChange={(event) => {
              const element = audio.current;
              if (element) element.currentTime = Number(event.target.value);
            }}
            className="accent-primary h-1 min-w-0 flex-1 cursor-pointer"
          />
          <span className="text-fg-faint w-[5.5rem] shrink-0 text-right text-[11px] tabular-nums">
            {clock(at)} / {length ? clock(length) : "–:––"}
          </span>
        </div>
      </div>
      <audio
        ref={audio}
        src={file.url}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(event) => setAt(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => setLength(event.currentTarget.duration)}
      />
    </div>
  );
}
