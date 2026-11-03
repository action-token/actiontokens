"use client";

import {
  Download,
  Loader2,
  Pause,
  Play,
  Repeat,
  Square,
  Volume2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import { Button } from "@bandcoin/ui/components/button";
import { cn } from "@bandcoin/ui/lib/cn";

import { clock } from "./mix";
import type { Mixer } from "./use-mixer";

/** Play, stop, loop, the time, master volume, zoom and export. */
export function Transport({ mixer }: { mixer: Mixer }) {
  const empty = mixer.project.tracks.length === 0;
  return (
    <div className="bg-surface flex flex-wrap items-center gap-2 rounded-xl border p-2">
      <Button
        size="icon"
        aria-label={mixer.playing ? "Pause" : "Play"}
        disabled={empty}
        onClick={mixer.playing ? mixer.pause : mixer.play}
      >
        {mixer.playing ? <Pause className="fill-current" /> : <Play className="fill-current" />}
      </Button>
      <Button size="icon" variant="ghost" aria-label="Stop" disabled={empty} onClick={mixer.stop}>
        <Square />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        aria-label={mixer.loop ? "Stop looping" : "Loop"}
        aria-pressed={mixer.loop}
        onClick={() => mixer.setLoop(!mixer.loop)}
        className={cn(mixer.loop && "bg-primary-soft text-primary-text")}
      >
        <Repeat />
      </Button>
      <p className="min-w-32 px-2 font-mono text-sm tabular-nums">
        {clock(mixer.time)} <span className="text-fg-faint">/ {clock(mixer.length)}</span>
      </p>
      <label className="text-fg-muted flex items-center gap-2 text-xs">
        <Volume2 className="size-4" />
        <span className="sr-only">Master volume</span>
        <input
          type="range"
          min={0}
          max={1.5}
          step={0.01}
          value={mixer.project.masterVolume}
          onChange={(event) => mixer.setMasterVolume(Number(event.target.value))}
          className="accent-primary w-24"
        />
        {Math.round(mixer.project.masterVolume * 100)}%
      </label>
      <div className="ml-auto flex items-center gap-1">
        <Button
          size="icon"
          variant="ghost"
          aria-label="Zoom out"
          disabled={mixer.zoom <= 0.25}
          onClick={() => mixer.setZoom(Math.max(0.25, mixer.zoom / 1.5))}
        >
          <ZoomOut />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          aria-label="Zoom in"
          disabled={mixer.zoom >= 6}
          onClick={() => mixer.setZoom(Math.min(6, mixer.zoom * 1.5))}
        >
          <ZoomIn />
        </Button>
        <Button variant="outline" disabled={empty || mixer.exporting} onClick={mixer.exportWav}>
          {mixer.exporting ? <Loader2 className="animate-spin" /> : <Download />}
          {mixer.exporting ? "Exporting…" : "Export WAV"}
        </Button>
      </div>
    </div>
  );
}
