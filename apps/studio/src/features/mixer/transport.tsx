"use client";

import {
  Copy,
  Download,
  Loader2,
  Magnet,
  Pause,
  Play,
  Redo2,
  Repeat,
  Scissors,
  Square,
  Undo2,
  Volume2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@bandcoin/ui/lib/cn";

import { clock } from "./mix";
import type { Mixer } from "./use-mixer";

const MOD = typeof navigator !== "undefined" && /Mac|iP/.test(navigator.platform) ? "⌘" : "Ctrl+";

/**
 * The bar under the timeline, like the prompt box on the other tools: play,
 * stop, loop and the time; undo, redo, split and duplicate; snapping and the
 * tempo; zoom, master volume and Export WAV.
 */
export function Transport({ mixer }: { mixer: Mixer }) {
  const empty = mixer.length === 0;
  return (
    <div className="studio-prompt bg-surface/95 flex flex-wrap items-center gap-1 rounded-[1.6rem] border-2 p-2 shadow-[0_10px_40px_-20px_rgb(0_0_0/0.5)]">
      <button
        type="button"
        aria-label={mixer.playing ? "Pause" : "Play"}
        title={`${mixer.playing ? "Pause" : "Play"} (Space)`}
        disabled={empty}
        onClick={mixer.playing ? mixer.pause : mixer.play}
        className="bg-primary text-primary-foreground grid size-11 place-items-center rounded-full transition-transform hover:scale-105 disabled:opacity-40 disabled:hover:scale-100"
      >
        {mixer.playing ? (
          <Pause className="size-5 fill-current" />
        ) : (
          <Play className="ml-0.5 size-5 fill-current" />
        )}
      </button>
      <Tool label="Stop" disabled={empty} onClick={mixer.stop}>
        <Square />
      </Tool>
      <Tool label="Loop" on={mixer.loop} onClick={() => mixer.setLoop(!mixer.loop)}>
        <Repeat />
      </Tool>
      <p className="bg-surface-2 mx-1 rounded-full px-3 py-1.5 font-mono text-sm tabular-nums">
        {clock(mixer.time)} <span className="text-fg-faint">/ {clock(mixer.length)}</span>
      </p>

      <Divider />
      <Tool label={`Undo (${MOD}Z)`} disabled={!mixer.canUndo} onClick={mixer.undo}>
        <Undo2 />
      </Tool>
      <Tool label={`Redo (⇧${MOD}Z)`} disabled={!mixer.canRedo} onClick={mixer.redo}>
        <Redo2 />
      </Tool>
      <Tool label="Split at the playhead (S)" disabled={!mixer.canSplit} onClick={mixer.split}>
        <Scissors />
      </Tool>
      <Tool
        label={`Duplicate the clip (${MOD}D)`}
        disabled={!mixer.selected}
        onClick={mixer.duplicate}
      >
        <Copy />
      </Tool>

      <Divider />
      <Tool
        label={mixer.project.snap ? "Snapping to beats (hold Alt to drag freely)" : "Snap to beats"}
        on={mixer.project.snap}
        onClick={() => mixer.setSnap(!mixer.project.snap)}
      >
        <Magnet />
      </Tool>
      <label className="text-fg-muted flex items-center gap-1 text-xs font-semibold">
        <input
          type="number"
          aria-label="Tempo (BPM)"
          min={40}
          max={240}
          value={mixer.project.bpm}
          onChange={(event) => {
            const value = Number(event.target.value);
            if (value >= 40 && value <= 240) mixer.setBpm(value);
          }}
          className="bg-surface-2 w-14 rounded-full px-2 py-1.5 text-center text-sm tabular-nums outline-none"
        />
        BPM
      </label>

      <span className="flex-1" />
      <Tool
        label="Zoom out"
        disabled={mixer.zoom <= 0.25}
        onClick={() => mixer.setZoom(Math.max(0.25, mixer.zoom / 1.5))}
      >
        <ZoomOut />
      </Tool>
      <Tool
        label="Zoom in"
        disabled={mixer.zoom >= 6}
        onClick={() => mixer.setZoom(Math.min(6, mixer.zoom * 1.5))}
      >
        <ZoomIn />
      </Tool>
      <label className="text-fg-muted mx-1 flex items-center gap-2 text-xs" title="Master volume">
        <Volume2 className="size-4" />
        <span className="sr-only">Master volume</span>
        <input
          type="range"
          min={0}
          max={1.5}
          step={0.01}
          value={mixer.project.masterVolume}
          onChange={(event) => mixer.setMasterVolume(Number(event.target.value))}
          className="accent-primary w-20"
        />
        <span className="w-8 tabular-nums">{Math.round(mixer.project.masterVolume * 100)}%</span>
      </label>
      <button
        type="button"
        disabled={empty || mixer.exporting}
        onClick={mixer.exportWav}
        className="bg-fg text-bg flex h-10 items-center gap-2 rounded-full px-4 text-sm font-bold transition-transform hover:scale-[1.02] disabled:opacity-40 disabled:hover:scale-100"
      >
        {mixer.exporting ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Download className="size-4" />
        )}
        {mixer.exporting ? "Exporting…" : "Export WAV"}
      </button>
    </div>
  );
}

function Tool({
  label,
  on,
  disabled,
  onClick,
  children,
}: {
  label: string;
  on?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "grid size-9 place-items-center rounded-full transition-colors disabled:opacity-35 [&_svg]:size-[18px]",
        on ? "bg-primary-soft text-primary-text" : "text-fg-muted hover:bg-surface-2 hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

const Divider = () => <span aria-hidden className="bg-fg/10 mx-1 h-6 w-px" />;
