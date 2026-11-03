"use client";

import { Headphones, Trash2, VolumeX } from "lucide-react";
import { type PointerEvent as ReactPointerEvent, useEffect, useState } from "react";

import { cn } from "@bandcoin/ui/lib/cn";

import { clipLength, clock, mixLength, type MixTrack, pxPerSecond } from "./mix";
import type { Mixer } from "./use-mixer";
import { Waveform } from "./waveform";

const HEADER = 208;
const PEAK_BUCKETS = 600;

/**
 * The timeline: a ruler (click to jump there), one row per track and the
 * playhead. Drag a clip to move it; drag its edges to trim it.
 */
export function Timeline({ mixer }: { mixer: Mixer }) {
  const scale = pxPerSecond(mixer.zoom);
  const seconds = Math.max(30, Math.ceil(mixLength(mixer.project.tracks) + 10));
  const width = seconds * scale;
  const step = scale >= 60 ? 1 : scale >= 20 ? 5 : 10;

  return (
    <div className="bg-surface overflow-x-auto rounded-xl border">
      <div className="relative" style={{ width: HEADER + width }}>
        <div className="bg-surface-2 sticky top-0 flex h-8 border-b">
          <div
            className="bg-surface-2 sticky left-0 z-10 shrink-0 border-r"
            style={{ width: HEADER }}
          />
          <button
            type="button"
            aria-label="Jump to a point"
            className="relative h-full cursor-pointer"
            style={{ width }}
            onClick={(event) => {
              const box = event.currentTarget.getBoundingClientRect();
              mixer.seek((event.clientX - box.left) / scale);
            }}
          >
            {Array.from({ length: Math.floor(seconds / step) + 1 }, (_, index) => (
              <span
                key={index}
                className="text-fg-faint absolute top-0 h-full border-l pl-1 text-[10px] leading-8"
                style={{ left: index * step * scale }}
              >
                {clock(index * step).replace(/\.0$/, "")}
              </span>
            ))}
          </button>
        </div>
        {mixer.project.tracks.map((track) => (
          <TrackRow key={track.id} track={track} mixer={mixer} scale={scale} width={width} />
        ))}
        <div
          aria-hidden
          className="bg-primary pointer-events-none absolute top-0 bottom-0 w-0.5"
          style={{ left: HEADER + mixer.time * scale }}
        />
      </div>
    </div>
  );
}

function TrackRow({
  track,
  mixer,
  scale,
  width,
}: {
  track: MixTrack;
  mixer: Mixer;
  scale: number;
  width: number;
}) {
  const [peaks, setPeaks] = useState<Float32Array | null>(null);
  useEffect(() => {
    let live = true;
    mixer
      .peaks(track.url, PEAK_BUCKETS)
      .then((values) => live && setPeaks(values))
      .catch(() => undefined);
    return () => {
      live = false;
    };
    // Peaks depend on the file only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track.url]);

  /** Drags a clip (or one of its edges); the change lands when the pointer lets go. */
  function drag(event: ReactPointerEvent, what: "move" | "start" | "end") {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    const clip = target.closest<HTMLElement>("[data-clip]")!;
    const onMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startX;
      if (what === "move") clip.style.transform = `translateX(${dx}px)`;
      else if (what === "end") clip.style.width = `${clipLength(track) * scale + dx}px`;
      else {
        clip.style.transform = `translateX(${dx}px)`;
        clip.style.width = `${clipLength(track) * scale - dx}px`;
      }
    };
    const onUp = (upEvent: PointerEvent) => {
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
      clip.style.transform = "";
      clip.style.width = "";
      const delta = (upEvent.clientX - startX) / scale;
      if (Math.abs(delta) < 0.01) return;
      if (what === "move") mixer.move(track.id, track.startTime + delta);
      else mixer.trim(track.id, what, delta);
    };
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
  }

  const length = clipLength(track);
  return (
    <div className="flex h-20 border-b last:border-b-0">
      <div
        className="bg-surface sticky left-0 z-10 grid shrink-0 content-center gap-1.5 border-r px-3"
        style={{ width: HEADER }}
      >
        <div className="flex items-center gap-2">
          <span className="size-2.5 shrink-0 rounded-full" style={{ background: track.color }} />
          <input
            aria-label="Track name"
            value={track.name}
            maxLength={80}
            onChange={(event) => mixer.update(track.id, { name: event.target.value })}
            className="min-w-0 flex-1 truncate bg-transparent text-sm font-semibold outline-none"
          />
        </div>
        <div className="flex items-center gap-1">
          <input
            type="range"
            aria-label={`${track.name} volume`}
            min={0}
            max={1.5}
            step={0.01}
            value={track.volume}
            onChange={(event) => mixer.update(track.id, { volume: Number(event.target.value) })}
            className="accent-primary w-16"
          />
          <ToggleButton
            label="Mute"
            on={track.muted}
            onClick={() => mixer.update(track.id, { muted: !track.muted })}
          >
            <VolumeX className="size-3.5" />
          </ToggleButton>
          <ToggleButton
            label="Solo"
            on={track.soloed}
            onClick={() => mixer.update(track.id, { soloed: !track.soloed })}
          >
            <Headphones className="size-3.5" />
          </ToggleButton>
          <button
            type="button"
            aria-label={`Remove ${track.name}`}
            onClick={() => mixer.remove(track.id)}
            className="text-fg-faint hover:text-danger ml-auto grid size-7 place-items-center rounded-md"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>
      <div className="relative" style={{ width }}>
        <div
          data-clip
          onPointerDown={(event) => drag(event, "move")}
          className={cn(
            "absolute top-2 bottom-2 cursor-grab overflow-hidden rounded-lg border-2 active:cursor-grabbing",
            (track.muted || (mixer.project.tracks.some((t) => t.soloed) && !track.soloed)) &&
              "opacity-40",
          )}
          style={{
            left: track.startTime * scale,
            width: length * scale,
            borderColor: track.color,
            background: `${track.color}22`,
          }}
          title={`${track.name} · ${clock(length)}`}
        >
          <Waveform
            peaks={peaks}
            from={track.trimStart / track.duration}
            to={(track.duration - track.trimEnd) / track.duration}
            color={track.color}
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
      </div>
    </div>
  );
}

function ToggleButton({
  label,
  on,
  onClick,
  children,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={on}
      title={label}
      onClick={onClick}
      className={cn(
        "grid size-7 place-items-center rounded-md border text-xs",
        on ? "bg-primary text-primary-foreground border-fg" : "text-fg-muted hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}
