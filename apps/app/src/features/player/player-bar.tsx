"use client";

import {
  AudioLines,
  ChevronUp,
  Loader2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@bandcoin/ui/components/button";
import { cn } from "@bandcoin/ui/lib/cn";
import { Popover, PopoverContent, PopoverTrigger } from "@bandcoin/ui/components/popover";

import { Money } from "~/components/money";
import { api } from "~/trpc/react";

import { ReactionButtons } from "../reactions/reaction-buttons";
import { StemRows } from "../stems/stem-rows";
import { useStemMode } from "../stems/use-stem-mode";
import { FullPlayer } from "./full-player";
import { currentTrack, usePlayer } from "./player-store";
import { clock, progressPercent } from "./time";
import { showSidebarBuy } from "../shell/sidebar-buy";

let session: string | null = null;
/** One id per browser tab, so plays from the same tab can be told apart from others. */
const listeningSession = () => (session ??= crypto.randomUUID());

/**
 * The bar at the bottom of every page. Owners hear the full track; everyone
 * else hears the 30 s preview and is offered the item when it ends. The next
 * track's URL is fetched ahead so skipping doesn't wait.
 */
export function PlayerBar() {
  const {
    queue,
    index,
    playing,
    toggle,
    setPlaying,
    next,
    previous,
    fullOpen,
    setFullOpen,
    dismiss,
  } = usePlayer();
  const track = currentTrack({ queue, index });
  const upNext = queue[index + 1];
  const audio = useRef<HTMLAudioElement>(null);
  const panelId = useId();
  // Both are tagged with the track they belong to, so a new track starts from zero without an effect.
  const [progress, setProgress] = useState({ trackId: "", current: 0, duration: 0 });
  const [previewEndedFor, setPreviewEndedFor] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  // Dragging the volume up from zero or from muted brings the sound back.
  const changeVolume = (next: number) => {
    setVolume(next);
    setMuted(next === 0);
  };

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

  // A new song gets a fresh <audio> element, so the level is set again when the source changes.
  useEffect(() => {
    if (audio.current) audio.current.volume = volume;
  }, [volume, source]);

  if (!track) return null;
  const previewEnded = previewEndedFor === track.id;
  const time = progress.trackId === track.id ? progress : { current: 0, duration: 0 };
  const duration = stems.active ? stems.duration : (playback.data?.durationSec ?? time.duration);
  const current = stems.active ? stems.position : time.current;
  const seek = (seconds: number) => {
    if (stems.active) stems.seek(seconds);
    else if (audio.current) audio.current.currentTime = seconds;
  };
  const stemsButton = stems.available ? (
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
  ) : null;
  const info = (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- covers come from many hosts */}
      <img src={track.coverUrl} alt="" className="size-9 shrink-0 rounded-sm object-cover" />
      <div className="min-w-0">
        <b className="display block truncate text-lg leading-tight">{track.title}</b>
        <span className="text-fg-muted block truncate text-[11px] leading-tight">
          {track.artistName}
          {preview && " · 30 s preview"}
        </span>
      </div>
    </>
  );

  return (
    // Phones: the expanded player is a sheet that slides up from the bar's top edge. Wide
    // screens see only the bar (`contents` drops this wrapper).
    <div className="pointer-events-auto relative flex flex-col sm:contents">
      <FullPlayer
        id={panelId}
        current={current}
        duration={duration}
        onSeek={seek}
        offerBuy={showSidebarBuy(track, playback.data)}
        preview={preview}
        muted={muted}
        volume={volume}
        onVolume={changeVolume}
        onToggleMute={() => setMuted((value) => !value)}
        stemsSlot={stemsButton}
      />
      <div
        role="region"
        aria-label="Player"
        className={cn(
          "bg-surface sm:bg-surface/70 pointer-events-auto relative z-10 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t px-4 py-1.5 max-sm:pb-[2.5rem] sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:rounded-[1.5rem] sm:border sm:px-5 sm:py-2 sm:shadow-[0_20px_40px_-14px_rgb(0_0_0/0.45)] sm:backdrop-blur-lg",
          // Open: the bar is the drawer's foot, one surface with it, so no line between them.
          fullOpen && "max-sm:border-t-transparent",
        )}
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

        {/* Phones: how far into the song, along the top edge of the bar */}
        <div aria-hidden className="bg-fg/10 absolute inset-x-0 top-0 h-0.5 sm:hidden">
          <div
            className="bg-primary h-full transition-[width] duration-300 ease-linear"
            style={{ width: `${progressPercent(current, duration)}%` }}
          />
        </div>

        {/* Wide screens: the seek line runs the full width of the card's top edge, like YouTube
            Music. It is clipped to the card's rounded outline, so it follows the corners. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 hidden overflow-hidden rounded-[1.5rem] sm:block"
        >
          <div className="bg-fg/15 absolute inset-x-0 top-0 h-1" />
          <div
            className="bg-primary absolute top-0 left-0 h-1"
            style={{ width: `${progressPercent(current, duration)}%` }}
          />
        </div>
        {/* The playhead dot sits on the top edge (outside the clip, so it isn't cut in half), and
            the invisible range input covers the line plus a little room to grab. Drag or click to
            jump. */}
        <div className="group absolute inset-x-0 top-0 hidden h-1 sm:block">
          <span
            aria-hidden
            className="bg-primary absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-sm transition-transform group-hover:scale-125"
            style={{
              // Kept off the very ends so it doesn't float past the card's rounded corners
              left: `clamp(0.75rem, ${progressPercent(current, duration)}%, calc(100% - 0.75rem))`,
            }}
          />
          <input
            type="range"
            aria-label="Seek"
            min={0}
            max={duration || 0}
            step={0.5}
            value={Math.min(current, duration || 0)}
            onChange={(event) => seek(Number(event.target.value))}
            className="absolute inset-x-0 -top-1.5 h-4 w-full cursor-pointer opacity-0"
          />
        </div>

        {/* Left: previous, play/pause, next and the time. On a phone this sits right of the song. */}
        <div className="flex items-center gap-3 max-sm:order-1">
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
            {/* Phones: the chevron right of play/pause slides the player up and back down. */}
            <Button
              variant="ghost"
              size="icon-sm"
              aria-expanded={fullOpen}
              aria-controls={panelId}
              aria-label={fullOpen ? "Close the player" : "Open the player"}
              className="sm:hidden"
              onClick={() => setFullOpen(!fullOpen)}
            >
              <ChevronUp
                aria-hidden
                className={cn(
                  "transition-transform duration-400 motion-reduce:transition-none",
                  fullOpen && "rotate-180",
                )}
              />
            </Button>
          </div>
          <span className="num text-fg-faint hidden text-xs whitespace-nowrap sm:block">
            {clock(current)} / {clock(duration)}
          </span>
        </div>

        {/* Wide screens link to the song; on a phone, tapping the bar opens the full player. */}
        <div className="hidden min-w-0 items-center justify-center gap-4 sm:flex">
          <Link href={`/item/${track.slug}`} className="flex min-w-0 items-center gap-3">
            {info}
          </Link>
          <ReactionButtons itemId={track.id} showCounts={false} />
        </div>
        <button
          type="button"
          onClick={() => setFullOpen(!fullOpen)}
          aria-label={`${fullOpen ? "Close" : "Open"} the player: ${track.title}`}
          className="flex min-w-0 items-center gap-3 text-left sm:hidden"
        >
          {info}
        </button>

        {/* Sized to its content, so the song and the seek bar shrink instead of the buttons spilling out */}
        <div className="hidden items-center justify-end gap-1 sm:flex">
          {stemsButton}
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
            {muted || volume === 0 ? <VolumeX /> : <Volume2 />}
          </Button>
          <input
            type="range"
            aria-label="Volume"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            onChange={(event) => changeVolume(Number(event.target.value))}
            className="accent-fg hidden h-1 w-20 cursor-pointer lg:block"
          />
          {/* Stops the music and removes the player and the right-hand panel. */}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Dismiss the player"
            title="Close the player"
            className="ml-1"
            onClick={dismiss}
          >
            <X />
          </Button>
        </div>
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
        className="border-fg bg-surface grid max-h-[70dvh] w-[25rem] max-w-[calc(100vw-1.5rem)] gap-3 overflow-y-auto rounded-2xl border-[3px] p-4 shadow-[6px_7px_0_0_var(--color-primary)]"
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
