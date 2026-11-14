"use client";

import { Loader2, Plus, Trash2, Volume2 } from "lucide-react";
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useState,
} from "react";

import { cn } from "@bandcoin/ui/lib/cn";

import { EqPopover } from "./eq-popover";
import {
  audible,
  clipEnd,
  clipLength,
  clock,
  type MixClip,
  type MixTrack,
  moveTo,
  pxPerSecond,
  setFade,
  snapTime,
  trim,
} from "./mix";
import type { Mixer, Pending } from "./use-mixer";
import { Waveform } from "./waveform";

const HEADER = 236;
const STAGE: Record<Pending["stage"], string> = {
  Waiting: "Waiting…",
  Unzipping: "Unpacking the zip…",
  Checking: "Opening the audio…",
  Uploading: "Uploading…",
  Loading: "Loading…",
};
const BUCKETS = 800;

/** Peaks per file, worked out once however many clips use it. */
const peakCache = new Map<string, Promise<Float32Array>>();
function usePeaks(mixer: Mixer, url: string) {
  const [peaks, setPeaks] = useState<Float32Array | null>(null);
  useEffect(() => {
    let live = true;
    let promise = peakCache.get(url);
    if (!promise) {
      promise = mixer.peaks(url, BUCKETS);
      peakCache.set(url, promise);
      promise.catch(() => peakCache.delete(url));
    }
    promise.then((values) => live && setPeaks(values)).catch(() => undefined);
    return () => {
      live = false;
    };
    // Peaks depend on the file only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);
  return peaks;
}

/**
 * The timeline, filling the page: a ruler (click to jump), a lane per track
 * with its clips, and the playhead. Click a clip to select it; drag it to move
 * it, its edges to trim it, the dots at its top corners to fade it. Moves land
 * on beats when snapping is on; hold Alt to place freely.
 */
export function Timeline({ mixer, onAdd }: { mixer: Mixer; onAdd: () => void }) {
  const scale = pxPerSecond(mixer.zoom);
  const seconds = Math.max(30, Math.ceil(mixer.length + 15));
  const width = seconds * scale;
  const step = scale >= 60 ? 1 : scale >= 20 ? 5 : 10;
  const beat = (60 / mixer.project.bpm) * scale;
  const heard = new Set(audible(mixer.project.tracks).map((track) => track.id));
  // Beat and bar lines behind the clips, when there's room to see them.
  const grid: CSSProperties | undefined =
    mixer.project.snap && beat >= 8
      ? {
          backgroundImage: `repeating-linear-gradient(to right, color-mix(in oklab, var(--color-fg) 14%, transparent) 0 1px, transparent 1px ${beat * 4}px), repeating-linear-gradient(to right, color-mix(in oklab, var(--color-fg) 6%, transparent) 0 1px, transparent 1px ${beat}px)`,
        }
      : undefined;

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="relative min-h-full" style={{ width: HEADER + width }}>
        <div className="bg-bg/95 sticky top-0 z-30 flex h-9 border-b">
          <div
            className="bg-bg/95 text-fg-muted sticky left-0 z-40 flex shrink-0 items-center border-r px-4 text-xs font-semibold"
            style={{ width: HEADER }}
          >
            {mixer.project.tracks.length} {mixer.project.tracks.length === 1 ? "track" : "tracks"}
            {mixer.pending.length > 0 && ` · adding ${mixer.pending.length}`}
          </div>
          <button
            type="button"
            aria-label="Jump to a point"
            className="relative h-full cursor-pointer"
            style={{ width }}
            onClick={(event) => {
              const box = event.currentTarget.getBoundingClientRect();
              mixer.seek((event.clientX - box.left) / scale, event.altKey);
            }}
          >
            {Array.from({ length: Math.floor(seconds / step) + 1 }, (_, index) => (
              <span
                key={index}
                className="text-fg-faint absolute top-0 h-full border-l pl-1 text-[10px] leading-9 tabular-nums"
                style={{ left: index * step * scale }}
              >
                {clock(index * step).replace(/\.0$/, "")}
              </span>
            ))}
            <span
              aria-hidden
              className="border-t-primary absolute top-0 -ml-[6px] size-0 border-x-[6px] border-t-[8px] border-x-transparent"
              style={{ left: mixer.time * scale }}
            />
          </button>
        </div>

        {mixer.project.tracks.map((track) => (
          <div key={track.id} className="flex h-24 border-b">
            <TrackHeader track={track} mixer={mixer} />
            <div
              className="relative"
              style={{ width, ...grid }}
              onPointerDown={(event) => {
                if (event.target !== event.currentTarget) return;
                const box = event.currentTarget.getBoundingClientRect();
                mixer.select(null);
                mixer.seek((event.clientX - box.left) / scale, event.altKey);
              }}
            >
              {track.clips.map((clip) => (
                <Clip
                  key={clip.id}
                  track={track}
                  clip={clip}
                  mixer={mixer}
                  scale={scale}
                  heard={heard.has(track.id)}
                />
              ))}
            </div>
          </div>
        ))}

        {mixer.pending.map((entry) => (
          <div key={entry.id} className="flex h-24 border-b" aria-busy>
            <div
              className="bg-surface sticky left-0 z-20 flex shrink-0 items-center gap-3 border-r px-4"
              style={{ width: HEADER }}
            >
              <Loader2 className="text-primary-text size-5 shrink-0 animate-spin" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold">{entry.name}</span>
                <span className="text-fg-muted block text-xs">{STAGE[entry.stage]}</span>
              </span>
            </div>
            <div className="relative" style={{ width }}>
              <div className="bg-fg/5 absolute top-1.5 bottom-1.5 left-0 w-64 animate-pulse rounded-xl border-2 border-dashed" />
            </div>
          </div>
        ))}

        <div className="flex h-16">
          <div
            className="sticky left-0 z-20 flex shrink-0 items-center px-3"
            style={{ width: HEADER }}
          >
            <button
              type="button"
              onClick={onAdd}
              className="text-fg-muted hover:text-fg hover:border-fg/40 flex h-10 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed text-sm font-semibold transition-colors"
            >
              <Plus className="size-4" /> Add audio
            </button>
          </div>
        </div>

        <div
          aria-hidden
          className="bg-primary pointer-events-none absolute top-0 bottom-0 z-[15] w-0.5"
          style={{ left: HEADER + mixer.time * scale }}
        />
      </div>
    </div>
  );
}

function TrackHeader({ track, mixer }: { track: MixTrack; mixer: Mixer }) {
  return (
    <div className="bg-surface sticky left-0 z-20 flex shrink-0 border-r" style={{ width: HEADER }}>
      <span aria-hidden className="w-1.5 shrink-0" style={{ background: track.color }} />
      <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)] content-center gap-2 px-3">
        <div className="flex items-center gap-1">
          <input
            aria-label="Track name"
            value={track.name}
            maxLength={80}
            onChange={(event) => mixer.updateTrack(track.id, { name: event.target.value }, "name")}
            className="focus:bg-surface-2 w-0 min-w-0 flex-1 truncate rounded-md bg-transparent px-1 py-0.5 text-sm font-bold outline-none"
          />
          <Toggle
            label="Mute"
            on={track.muted}
            onClick={() => mixer.updateTrack(track.id, { muted: !track.muted })}
          >
            M
          </Toggle>
          <Toggle
            label="Solo"
            on={track.soloed}
            onClick={() => mixer.updateTrack(track.id, { soloed: !track.soloed })}
          >
            S
          </Toggle>
          <EqPopover
            small
            name={track.name}
            eq={track.eq}
            onChange={(eq) => mixer.setTrackEq(track.id, eq)}
          />
          <button
            type="button"
            aria-label={`Remove ${track.name}`}
            title="Remove the track"
            onClick={() => mixer.removeTrack(track.id)}
            className="text-fg-faint hover:text-danger grid size-7 place-items-center rounded-md"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
        <div className="text-fg-faint flex items-center gap-1.5 px-1 text-[10px] font-semibold">
          <Volume2 className="size-3.5 shrink-0" />
          <input
            type="range"
            aria-label={`${track.name} volume`}
            title={`Volume ${Math.round(track.volume * 100)}%`}
            min={0}
            max={1.5}
            step={0.01}
            value={track.volume}
            onChange={(event) =>
              mixer.updateTrack(track.id, { volume: Number(event.target.value) }, "volume")
            }
            className="accent-primary w-20 min-w-0"
          />
          <span className="ml-auto">L</span>
          <input
            type="range"
            aria-label={`${track.name} pan`}
            title={
              track.pan === 0
                ? "Centre (double-click to reset)"
                : `${Math.round(Math.abs(track.pan) * 100)}% ${track.pan < 0 ? "left" : "right"}`
            }
            min={-1}
            max={1}
            step={0.05}
            value={track.pan}
            onChange={(event) =>
              mixer.updateTrack(track.id, { pan: Number(event.target.value) }, "pan")
            }
            onDoubleClick={() => mixer.updateTrack(track.id, { pan: 0 })}
            className="accent-fg w-12 min-w-0"
          />
          <span>R</span>
        </div>
      </div>
    </div>
  );
}

type Grip = "move" | "start" | "end" | "fadeIn" | "fadeOut";

function Clip({
  track,
  clip,
  mixer,
  scale,
  heard,
}: {
  track: MixTrack;
  clip: MixClip;
  mixer: Mixer;
  scale: number;
  heard: boolean;
}) {
  const peaks = usePeaks(mixer, clip.url);
  const [preview, setPreview] = useState<MixClip | null>(null);
  const selected = mixer.selected?.clipId === clip.id;
  const { bpm, snap } = mixer.project;

  /** Where the clip would be after dragging `grip` by `dx` pixels (what letting go applies). */
  function dragged(grip: Grip, dx: number, free: boolean): MixClip {
    const delta = dx / scale;
    const at = (seconds: number) => snapTime(seconds, bpm, snap && !free);
    if (grip === "move") return moveTo(clip, at(clip.startTime + delta));
    if (grip === "start") return trim(clip, "start", at(clip.startTime + delta) - clip.startTime);
    if (grip === "end") return trim(clip, "end", at(clipEnd(clip) + delta) - clipEnd(clip));
    if (grip === "fadeIn") return setFade(clip, "in", clip.fadeIn + delta);
    return setFade(clip, "out", clip.fadeOut - delta);
  }

  function drag(event: ReactPointerEvent, grip: Grip) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    mixer.select({ trackId: track.id, clipId: clip.id });
    const startX = event.clientX;
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    let moved = false;
    const onMove = (move: PointerEvent) => {
      const dx = move.clientX - startX;
      if (!moved && Math.abs(dx) < 3) return;
      moved = true;
      setPreview(dragged(grip, dx, move.altKey));
    };
    const onUp = (up: PointerEvent) => {
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
      setPreview(null);
      if (!moved) return;
      const dx = up.clientX - startX;
      const delta = dx / scale;
      if (grip === "move") mixer.move(track.id, clip.id, clip.startTime + delta, up.altKey);
      else if (grip === "start" || grip === "end")
        mixer.trim(track.id, clip.id, grip, delta, up.altKey);
      else {
        const next = dragged(grip, dx, true);
        mixer.fade(
          track.id,
          clip.id,
          grip === "fadeIn" ? "in" : "out",
          grip === "fadeIn" ? next.fadeIn : next.fadeOut,
        );
      }
    };
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
  }

  const shown = preview ?? clip;
  const length = clipLength(shown);
  const px = length * scale;
  return (
    <div
      data-clip
      aria-label={`${track.name}, ${clock(shown.startTime)} to ${clock(clipEnd(shown))}`}
      aria-selected={selected}
      onPointerDown={(event) => drag(event, "move")}
      className={cn(
        "group absolute top-1.5 bottom-1.5 cursor-grab touch-none overflow-hidden rounded-xl border-2 select-none active:cursor-grabbing",
        !heard && "opacity-40",
        selected && "outline-fg outline-2 outline-offset-1",
        preview && "z-10 shadow-lg",
      )}
      style={{
        left: shown.startTime * scale,
        width: px,
        borderColor: track.color,
        background: `color-mix(in oklab, ${track.color} 16%, transparent)`,
      }}
      title={`${track.name} · ${clock(length)}`}
    >
      <div
        className="pointer-events-none flex h-5 items-center gap-1.5 truncate px-2 text-[11px] font-bold"
        style={{ background: `color-mix(in oklab, ${track.color} 30%, transparent)` }}
      >
        <span className="truncate">{track.name}</span>
        {px > 120 && <span className="tabular-nums opacity-60">{clock(length)}</span>}
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-5 bottom-0">
        <Waveform
          peaks={peaks}
          from={shown.trimStart / shown.duration}
          to={(shown.duration - shown.trimEnd) / shown.duration}
          color={track.color}
        />
      </div>
      {shown.fadeIn > 0 && <FadeShade side="in" width={shown.fadeIn * scale} />}
      {shown.fadeOut > 0 && <FadeShade side="out" width={shown.fadeOut * scale} />}
      <span
        role="separator"
        aria-label="Fade in"
        title="Drag to fade in"
        onPointerDown={(event) => drag(event, "fadeIn")}
        className="bg-bg border-fg absolute top-0.5 z-10 size-3 cursor-ew-resize rounded-full border-2 opacity-0 transition-opacity group-hover:opacity-100 group-aria-selected:opacity-100"
        style={{ left: Math.max(2, Math.min(px - 14, shown.fadeIn * scale - 6)) }}
      />
      <span
        role="separator"
        aria-label="Fade out"
        title="Drag to fade out"
        onPointerDown={(event) => drag(event, "fadeOut")}
        className="bg-bg border-fg absolute top-0.5 z-10 size-3 cursor-ew-resize rounded-full border-2 opacity-0 transition-opacity group-hover:opacity-100 group-aria-selected:opacity-100"
        style={{ right: Math.max(2, Math.min(px - 14, shown.fadeOut * scale - 6)) }}
      />
      <span
        role="separator"
        aria-label="Trim the start"
        onPointerDown={(event) => drag(event, "start")}
        className="absolute inset-y-0 left-0 w-2 cursor-ew-resize hover:bg-white/30"
      />
      <span
        role="separator"
        aria-label="Trim the end"
        onPointerDown={(event) => drag(event, "end")}
        className="absolute inset-y-0 right-0 w-2 cursor-ew-resize hover:bg-white/30"
      />
    </div>
  );
}

/** Mute or solo: a small letter button, filled while on. */
function Toggle({
  label,
  on,
  onClick,
  children,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={on}
      title={label}
      onClick={onClick}
      className={cn(
        "grid size-7 place-items-center rounded-md border text-[11px] font-black",
        on
          ? "bg-primary text-primary-foreground border-transparent"
          : "text-fg-muted hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

/** The quiet part of a fade, shaded above the volume line. */
function FadeShade({ side, width }: { side: "in" | "out"; width: number }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className={cn("pointer-events-none absolute inset-y-0", side === "in" ? "left-0" : "right-0")}
      style={{ width }}
    >
      <polygon
        points={side === "in" ? "0,0 100,0 0,100" : "0,0 100,0 100,100"}
        className="fill-bg/60"
      />
      <line
        x1={side === "in" ? 0 : 0}
        y1={side === "in" ? 100 : 0}
        x2={100}
        y2={side === "in" ? 0 : 100}
        vectorEffect="non-scaling-stroke"
        className="stroke-fg/70"
        strokeWidth={1.5}
      />
    </svg>
  );
}
