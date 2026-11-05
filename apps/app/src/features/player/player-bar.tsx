"use client";

import {
  AudioLines,
  Loader2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Button } from "@bandcoin/ui/components/button";
import { cn } from "@bandcoin/ui/lib/cn";
import { Popover, PopoverContent, PopoverTrigger } from "@bandcoin/ui/components/popover";

import { Money } from "~/components/money";
import { api } from "~/trpc/react";

import { ReactionButtons } from "../reactions/reaction-buttons";
import { StemRows } from "../stems/stem-rows";
import { useStemMode } from "../stems/use-stem-mode";
import { currentTrack, usePlayer } from "./player-store";

let session: string | null = null;
/** One id per browser tab, so plays from the same tab can be told apart from others. */
const listeningSession = () => (session ??= crypto.randomUUID());

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

  const playback = api.media.play.useQuery(
    { itemId: track?.id ?? "" },
    { enabled: Boolean(track), staleTime: 30 * 60_000 },
  );
  api.media.play.useQuery(
    { itemId: upNext?.id ?? "" },
    { enabled: Boolean(upNext), staleTime: 30 * 60_000 },
  );

  const source = playback.data?.url;
  const recordPlay = api.media.recordPlay.useMutation();
  const preview = playback.data ? !playback.data.full : false;
  const finish = () => {
    if (preview && track) setPreviewEndedFor(track.id);
    next();
  };

  const stemList = api.media.stems.useQuery(
    { itemId: track?.id ?? "" },
    { enabled: Boolean(track), staleTime: 30 * 60_000 },
  );
  const stems = useStemMode({
    trackId: track?.id ?? null,
    sources: stemList.data?.stems ?? [],
    playing,
    onEnded: finish,
  });

  // The normal audio stays silent while the stems are playing.
  useEffect(() => {
    const element = audio.current;
    if (!element || !source) return;
    if (playing && !stems.active) void element.play().catch(() => setPlaying(false));
    else element.pause();
  }, [playing, source, setPlaying, stems.active]);

  if (!track) return null;
  const previewEnded = previewEndedFor === track.id;
  const time = progress.trackId === track.id ? progress : { current: 0, duration: 0 };
  const duration = stems.active ? stems.duration : (playback.data?.durationSec ?? time.duration);
  const current = stems.active ? stems.position : time.current;

  return (
    <div
      role="region"
      aria-label="Player"
      className="bg-surface/95 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t px-4 py-1.5 backdrop-blur sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]"
    >
      {source && (
        <audio
          ref={audio}
          src={source}
          preload="auto"
          muted={muted}
          onTimeUpdate={(event) => {
            const element = event.currentTarget;
            setProgress({
              trackId: track.id,
              current: element.currentTime,
              duration: element.duration || 0,
            });
            // A preview cut by bytes can run a little long; it ends at its stated length.
            if (preview && duration && element.currentTime >= duration) {
              element.pause();
              finish();
            }
          }}
          onPlay={(event) => {
            // A play counts when a song starts from the beginning, not when it resumes from pause.
            if (event.currentTarget.currentTime < 0.5) {
              recordPlay.mutate({
                itemId: track.id,
                sessionId: listeningSession(),
                isPreview: preview,
              });
            }
          }}
          onEnded={finish}
        />
      )}

      <Link href={`/item/${track.slug}`} className="flex min-w-0 items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- covers come from many hosts */}
        <img src={track.coverUrl} alt="" className="size-9 shrink-0 rounded-sm object-cover" />
        <div className="min-w-0">
          <b className="display block truncate text-lg leading-tight">{track.title}</b>
          <span className="text-fg-muted block truncate text-[11px] leading-tight">
            {track.artistName}
            {preview && " · 30 s preview"}
          </span>
        </div>
      </Link>

      <div className="grid justify-items-center gap-0.5">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Previous"
            className="hidden sm:inline-flex"
            onClick={previous}
          >
            <SkipBack className="fill-current" />
          </Button>
          <Button
            size="icon-sm"
            aria-label={playing ? "Pause" : "Play"}
            className="bg-fg text-bg hover:bg-fg/90 size-8 rounded-full"
            disabled={!source}
            onClick={toggle}
          >
            {playing ? <Pause className="fill-current" /> : <Play className="fill-current" />}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Next"
            className="hidden sm:inline-flex"
            disabled={!upNext}
            onClick={next}
          >
            <SkipForward className="fill-current" />
          </Button>
        </div>
        <div className="num text-fg-faint hidden w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 text-[10px] leading-none sm:grid">
          <span>{clock(current)}</span>
          <input
            type="range"
            aria-label="Seek"
            min={0}
            max={duration || 0}
            step={0.5}
            value={Math.min(current, duration || 0)}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (stems.active) stems.seek(next);
              else if (audio.current) audio.current.currentTime = next;
            }}
            className="accent-fg h-1 w-full cursor-pointer"
          />
          <span>{clock(duration)}</span>
        </div>
      </div>

      {/* Sized to its content, so the song and the seek bar shrink instead of the buttons spilling out */}
      <div className="hidden items-center justify-end gap-1 sm:flex">
        <ReactionButtons itemId={track.id} showCounts={false} />
        {stems.available && (
          <StemsButton
            stems={stems}
            sources={stemList.data?.stems ?? []}
            preview={!stemList.data?.full}
            onStart={() => void stems.start(audio.current?.currentTime ?? 0)}
            onStop={() => {
              const at = stems.stop();
              if (audio.current && at > 0) audio.current.currentTime = at;
            }}
          />
        )}
        {(preview || previewEnded) && (
          <Link
            href={`/item/${track.slug}#buy`}
            className="bg-primary text-primary-foreground border-fg ml-1 flex h-8 items-center gap-1.5 rounded-full border-2 px-3 text-[13px] font-bold whitespace-nowrap shadow-[2px_2px_0_0_var(--color-fg)] transition-transform hover:-translate-y-0.5"
          >
            Buy
            {track.price && (
              <Money
                amount={track.price.bandcoin}
                currency="BANDCOIN"
                short
                className="font-bold"
                onBrand
              />
            )}
          </Link>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={muted ? "Unmute" : "Mute"}
          onClick={() => setMuted((value) => !value)}
        >
          {muted ? <VolumeX /> : <Volume2 />}
        </Button>
      </div>
    </div>
  );
}

/**
 * The Stems button: opens a small mixer for the song's parts. Switching stems
 * on hands playback over from the normal audio at the same spot; "Back to the
 * full song" hands it back.
 */
function StemsButton({
  stems,
  sources,
  preview,
  onStart,
  onStop,
}: {
  stems: ReturnType<typeof useStemMode>;
  sources: { id: string; name: string; color: string }[];
  preview: boolean;
  onStart: () => void;
  onStop: () => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Stems"
          title="Mix this song's parts"
          aria-pressed={stems.active}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-full border-2 px-2 text-xs font-bold transition-colors",
            stems.active
              ? "bg-primary text-primary-foreground border-fg"
              : "border-border-strong text-fg-muted hover:bg-surface-3 hover:text-fg",
          )}
        >
          {stems.loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <AudioLines className="size-4" />
          )}
          <span className="hidden 2xl:inline">Stems</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="top"
        sideOffset={10}
        className="border-fg bg-surface grid max-h-[70dvh] w-[25rem] gap-3 overflow-y-auto rounded-2xl border-[3px] p-4 shadow-[6px_7px_0_0_var(--color-primary)]"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="display flex items-center gap-2 text-2xl leading-none">
              Stems
              {stems.active && (
                <span className="bg-primary text-primary-foreground rounded-full px-2 py-0.5 text-[10px] font-extrabold tracking-wide uppercase">
                  live
                </span>
              )}
            </h3>
            <p className="text-fg-muted mt-1.5 text-xs leading-snug">
              {stems.active ? (
                <>
                  Drag a bar for volume. <b className="text-fg">M</b> mutes a part.{" "}
                  <b className="text-fg">S</b> plays only that part.
                </>
              ) : (
                `This song has ${sources.length} separate parts. Play them together and mix them yourself.`
              )}
            </p>
          </div>
          {stems.active && (
            <Button
              variant="ghost"
              size="sm"
              className="-mt-1 -mr-2 h-7 shrink-0 px-2 text-xs"
              onClick={stems.reset}
            >
              Reset
            </Button>
          )}
        </div>

        {stems.active ? (
          <>
            <StemRows stems={sources} mix={stems.mix} setMix={stems.setMix} compact />
            <Button variant="secondary" size="sm" className="border-fg border-2" onClick={onStop}>
              Back to the full song
            </Button>
          </>
        ) : (
          <Button
            size="lg"
            disabled={stems.loading}
            onClick={onStart}
            className="border-fg border-2 font-bold shadow-[2px_3px_0_0_var(--color-fg)]"
          >
            {stems.loading ? <Loader2 className="animate-spin" /> : <AudioLines />}{" "}
            {stems.loading ? "Loading the parts…" : "Play with stems"}
          </Button>
        )}
        {preview && (
          <p className="text-fg-faint text-[11px] leading-snug">
            You hear the first 30 seconds of each part. Own the song to hear it all.
          </p>
        )}
        {stems.error && (
          <p role="alert" className="text-danger text-xs">
            {stems.error}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
