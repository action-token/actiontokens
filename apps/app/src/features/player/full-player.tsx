"use client";

import { Pause, Play, SkipBack, SkipForward, Volume2, VolumeX, X } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useEffect, useRef } from "react";

import { Button } from "@actiontokens/ui/components/button";
import { cn } from "@actiontokens/ui/lib/cn";

import { Money } from "~/components/money";

import { ReactionButtons } from "../reactions/reaction-buttons";
import { RightRule } from "../shell/right-frame";
import { UpNextList, useQueueAhead } from "../shell/up-next";
import { currentTrack, usePlayer } from "./player-store";
import { clock } from "./time";

/** Swipe down this far (px) on the top strip to close. */
const SWIPE_CLOSE_PX = 70;

/**
 * The phone's player, grown out of the mini bar: the bar's chevron slides this panel up from
 * the bar's top edge, over the page, with the tab bar still below. It holds what the bar has no
 * room for: the cover, seek bar, previous and next, likes, stems, Buy now during a preview, and
 * the queue. It only exists below `sm`; wide screens have the bar and the right panel.
 * The bar owns the audio, so the position and seeking come in as props.
 */
export function FullPlayer({
  id,
  current,
  duration,
  onSeek,
  offerBuy,
  preview,
  muted,
  volume,
  onVolume,
  onToggleMute,
  stemsSlot,
}: {
  /** The id the bar's chevron points at (aria-controls) */
  id: string;
  current: number;
  duration: number;
  onSeek: (seconds: number) => void;
  /** Show Buy now (the listener hears only the preview and the song has a price) */
  offerBuy: boolean;
  /** The 30 s preview is playing */
  preview: boolean;
  muted: boolean;
  /** 0 to 1 */
  volume: number;
  onVolume: (volume: number) => void;
  onToggleMute: () => void;
  /** The stems button, when the song has stems */
  stemsSlot: ReactNode;
}) {
  const { queue, index, playing, toggle, next, previous, fullOpen, setFullOpen, dismiss } =
    usePlayer();
  const track = currentTrack({ queue, index });
  const ahead = useQueueAhead();
  const swipe = useRef<number | null>(null);

  // Growing past the phone layout (rotating a tablet, resizing a window) closes it.
  useEffect(() => {
    const wide = window.matchMedia("(min-width: 40rem)");
    const close = () => wide.matches && setFullOpen(false);
    wide.addEventListener("change", close);
    return () => wide.removeEventListener("change", close);
  }, [setFullOpen]);

  useEffect(() => {
    if (!fullOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullOpen, setFullOpen]);

  // While the dimmed sheet is up, the page behind stays put: only the sheet's own list scrolls.
  useEffect(() => {
    if (!fullOpen) return;
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = before;
    };
  }, [fullOpen]);

  if (!track) return null;

  return (
    <>
      {/* The page behind goes dim while the drawer is up; tapping it closes the drawer. The tab bar
          stays above it. */}
      <div
        aria-hidden
        onClick={() => setFullOpen(false)}
        className={cn(
          "fixed inset-0 touch-none bg-black/45 transition-opacity duration-400 ease-[ease] motion-reduce:transition-none sm:hidden",
          fullOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        )}
      />
      <section
        id={id}
        aria-label={`Now playing: ${track.title}`}
        inert={!fullOpen}
        // A bottom sheet: sits on the bar's top edge and slides as one piece, up from behind the bar
        // to open and back down behind it to close. Hidden only once the closing slide has finished.
        className={cn(
          "absolute inset-x-0 bottom-full z-0 transition-[translate,visibility] duration-400 ease-[ease] motion-reduce:transition-none sm:hidden",
          fullOpen ? "visible translate-y-0" : "invisible translate-y-full",
        )}
      >
        <div>
          <div className="bg-surface rounded-t-[1.75rem] shadow-[0_-18px_40px_-14px_rgb(0_0_0/0.55)]">
            <div
              className="touch-none px-5 pb-1"
              onTouchStart={(event) => (swipe.current = event.touches[0]?.clientY ?? null)}
              onTouchEnd={(event) => {
                const start = swipe.current;
                swipe.current = null;
                const end = event.changedTouches[0]?.clientY;
                if (start !== null && end !== undefined && end - start > SWIPE_CLOSE_PX)
                  setFullOpen(false);
              }}
            >
              {/* The grab handle: tap it, or swipe down from here, to close. */}
              <button
                type="button"
                aria-label="Close the player"
                onClick={() => setFullOpen(false)}
                className="-mx-5 flex h-7 w-[calc(100%+2.5rem)] items-center justify-center"
              >
                <span className="bg-fg/25 h-1 w-10 rounded-full" />
              </button>
              <div className="flex items-center justify-between">
                <p className="marker text-fg-muted -rotate-2 text-base">*now playing*</p>
                {/* Stops the music and removes the player. */}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Dismiss the player"
                  className="-mr-2"
                  onClick={dismiss}
                >
                  <X className="size-4" />
                </Button>
              </div>
            </div>

            <div className="flex max-h-[calc(80dvh-var(--phone-bar-space)-7.5rem)] [scrollbar-width:none] flex-col gap-3.5 overflow-y-auto overscroll-contain px-5 pt-2 pb-4">
              <div className="grid shrink-0 grid-cols-[4.75rem_minmax(0,1fr)_auto] items-center gap-3">
                <Link
                  href={`/item/${track.slug}`}
                  onClick={() => setFullOpen(false)}
                  className="relative block"
                >
                  <span className="border-fg bg-surface-2 block overflow-hidden rounded-lg border-2 shadow-[3px_4px_0_0_var(--color-primary)]">
                    {/* eslint-disable-next-line @next/next/no-img-element -- covers come from many hosts */}
                    <img
                      src={track.coverUrl}
                      alt=""
                      className="aspect-square w-full object-cover"
                    />
                  </span>
                </Link>
                <Link
                  href={`/item/${track.slug}`}
                  onClick={() => setFullOpen(false)}
                  className="grid min-w-0 gap-0.5"
                >
                  {preview && (
                    <span className="bg-surface-2 text-fg-muted mb-0.5 w-fit rounded-full border px-2 py-px text-[10px] font-bold uppercase">
                      30 s preview
                    </span>
                  )}
                  <h2 className="display line-clamp-2 text-xl break-words">{track.title}</h2>
                  <p className="text-fg-muted truncate text-[13px]">{track.artistName}</p>
                </Link>
                <ReactionButtons itemId={track.id} showCounts={false} />
              </div>

              <div className="num text-fg-faint grid shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 text-[11px]">
                <span>{clock(current)}</span>
                <input
                  type="range"
                  aria-label="Seek"
                  min={0}
                  max={duration || 0}
                  step={0.5}
                  value={Math.min(current, duration || 0)}
                  onChange={(event) => onSeek(Number(event.target.value))}
                  className="accent-fg h-5 w-full cursor-pointer"
                />
                <span>{clock(duration)}</span>
              </div>

              <div className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center">
                {/* The sound control: mute, and a bar to set the level */}
                <div className="flex min-w-0 items-center gap-1 justify-self-start">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={muted ? "Unmute" : "Mute"}
                    className="size-9 shrink-0"
                    onClick={onToggleMute}
                  >
                    {muted || volume === 0 ? (
                      <VolumeX className="size-5" />
                    ) : (
                      <Volume2 className="size-5" />
                    )}
                  </Button>
                  <input
                    type="range"
                    aria-label="Volume"
                    min={0}
                    max={1}
                    step={0.05}
                    value={muted ? 0 : volume}
                    onChange={(event) => onVolume(Number(event.target.value))}
                    className="accent-fg h-5 w-14 min-w-0 cursor-pointer"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Previous"
                    className="size-10"
                    onClick={previous}
                  >
                    <SkipBack className="size-5 fill-current" />
                  </Button>
                  <Button
                    aria-label={playing ? "Pause" : "Play"}
                    className="bg-fg text-bg hover:bg-fg/90 size-12 rounded-full"
                    onClick={toggle}
                  >
                    {playing ? (
                      <Pause className="size-5 fill-current" />
                    ) : (
                      <Play className="size-5 fill-current" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Next"
                    className="size-10"
                    disabled={ahead === 0}
                    onClick={next}
                  >
                    <SkipForward className="size-5 fill-current" />
                  </Button>
                </div>
                <div className="flex items-center justify-self-end">{stemsSlot}</div>
              </div>

              {offerBuy && track.price && (
                <Link
                  href={`/item/${track.slug}#buy`}
                  onClick={() => setFullOpen(false)}
                  className="bg-primary text-primary-foreground border-fg flex h-10 shrink-0 items-center justify-center gap-2 rounded-none border-2 px-4 text-sm font-bold shadow-[3px_3px_0_0_var(--color-fg)] active:translate-y-0.5"
                >
                  Buy now
                  <Money
                    amount={track.price.actionToken}
                    currency="ACTION"
                    short
                    className="font-bold"
                    onBrand
                  />
                </Link>
              )}

              {ahead > 0 && (
                <>
                  <RightRule />
                  <UpNextList limit={8} />
                </>
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
