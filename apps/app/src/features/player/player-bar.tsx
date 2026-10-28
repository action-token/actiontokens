"use client";

import { Pause, Play, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Button } from "@bandcoin/ui/components/button";

import { api } from "~/trpc/react";

import { currentTrack, usePlayer } from "./player-store";

const clock = (seconds: number) => {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
};

/**
 * The bar at the bottom of every page. Owners hear the full track; everyone
 * else hears the 30 s preview and is offered the item when it ends. The next
 * track's URL is fetched ahead so skipping doesn't wait.
 */
export function PlayerBar() {
  const { queue, index, playing, toggle, setPlaying, next, previous } = usePlayer();
  const track = currentTrack({ queue, index });
  const upNext = queue[index + 1];
  const audio = useRef<HTMLAudioElement>(null);
  // Both are tagged with the track they belong to, so a new track starts from zero without an effect.
  const [progress, setProgress] = useState({ trackId: "", current: 0, duration: 0 });
  const [previewEndedFor, setPreviewEndedFor] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);

  const playback = api.media.play.useQuery({ itemId: track?.id ?? "" }, { enabled: Boolean(track), staleTime: 30 * 60_000 });
  api.media.play.useQuery({ itemId: upNext?.id ?? "" }, { enabled: Boolean(upNext), staleTime: 30 * 60_000 });

  const source = playback.data?.url;

  useEffect(() => {
    const element = audio.current;
    if (!element || !source) return;
    if (playing) void element.play().catch(() => setPlaying(false));
    else element.pause();
  }, [playing, source, setPlaying]);

  if (!track) return null;
  const preview = playback.data ? !playback.data.full : false;
  const previewEnded = previewEndedFor === track.id;
  const time = progress.trackId === track.id ? progress : { current: 0, duration: 0 };
  const duration = playback.data?.durationSec ?? time.duration;
  const finish = () => {
    if (preview) setPreviewEndedFor(track.id);
    next();
  };

  return (
    <div
      role="region"
      aria-label="Player"
      className="bg-surface/95 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-t px-4 py-2.5 backdrop-blur sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)]"
    >
      {source && (
        <audio
          ref={audio}
          src={source}
          preload="auto"
          muted={muted}
          onTimeUpdate={(event) => {
            const element = event.currentTarget;
            setProgress({ trackId: track.id, current: element.currentTime, duration: element.duration || 0 });
            // A preview cut by bytes can run a little long; it ends at its stated length.
            if (preview && duration && element.currentTime >= duration) {
              element.pause();
              finish();
            }
          }}
          onEnded={finish}
        />
      )}

      <Link href={`/item/${track.slug}`} className="flex min-w-0 items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- covers come from many hosts */}
        <img src={track.coverUrl} alt="" className="size-11 shrink-0 rounded-sm object-cover" />
        <div className="min-w-0">
          <b className="block truncate text-sm">{track.title}</b>
          <span className="text-fg-muted block truncate text-xs">
            {track.artistName}
            {preview && " · 30 s preview"}
          </span>
        </div>
      </Link>

      <div className="grid justify-items-center gap-1">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" aria-label="Previous" className="hidden sm:inline-flex" onClick={previous}>
            <SkipBack className="fill-current" />
          </Button>
          <Button
            size="icon"
            aria-label={playing ? "Pause" : "Play"}
            className="bg-fg text-bg hover:bg-fg/90"
            disabled={!source}
            onClick={toggle}
          >
            {playing ? <Pause className="fill-current" /> : <Play className="fill-current" />}
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Next" className="hidden sm:inline-flex" disabled={!upNext} onClick={next}>
            <SkipForward className="fill-current" />
          </Button>
        </div>
        <div className="num text-fg-faint hidden w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 text-[11px] sm:grid">
          <span>{clock(time.current)}</span>
          <input
            type="range"
            aria-label="Seek"
            min={0}
            max={duration || 0}
            step={0.5}
            value={Math.min(time.current, duration || 0)}
            onChange={(event) => {
              if (audio.current) audio.current.currentTime = Number(event.target.value);
            }}
            className="accent-fg h-1 w-full cursor-pointer"
          />
          <span>{clock(duration)}</span>
        </div>
      </div>

      <div className="hidden items-center justify-end gap-2 sm:flex">
        {(preview || previewEnded) && (
          <Button asChild size="sm" variant="secondary">
            <Link href={`/item/${track.slug}`}>Own it for the full track</Link>
          </Button>
        )}
        <Button variant="ghost" size="icon-sm" aria-label={muted ? "Unmute" : "Mute"} onClick={() => setMuted((value) => !value)}>
          {muted ? <VolumeX /> : <Volume2 />}
        </Button>
      </div>
    </div>
  );
}
