"use client";

import { RotateCcw } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@bandcoin/ui/components/popover";
import { cn } from "@bandcoin/ui/lib/cn";

import { clampEq, EQ_BANDS, EQ_RANGE, FLAT_EQ, isFlat, type MixEq } from "./mix";

const signed = (db: number) => `${db > 0 ? "+" : ""}${db} dB`;

/**
 * The EQ button and its pop-up: three bands (low, mid, high), each lifted or
 * cut by up to 12 dB, and Reset. Used for the whole mix (the top bar) and for
 * each track. The button is lit when the EQ isn't flat.
 */
export function EqPopover({
  name,
  eq,
  onChange,
  small = false,
}: {
  /** What it's the EQ of, for screen readers and the pop-up's title: "Mix", or a track's name */
  name: string;
  eq: MixEq | undefined;
  onChange: (eq: MixEq) => void;
  /** The smaller button used on a track */
  small?: boolean;
}) {
  const value = eq ?? FLAT_EQ;
  const flat = isFlat(eq);
  return (
    <Popover>
      <PopoverTrigger
        aria-label={`${name} EQ`}
        title={flat ? "EQ" : "EQ (on)"}
        className={cn(
          "grid shrink-0 place-items-center font-black transition-colors",
          small ? "h-7 rounded-md border px-1.5 text-[10px]" : "h-9 rounded-full px-3 text-xs",
          flat
            ? "text-fg-muted hover:text-fg hover:bg-surface-2"
            : small
              ? "bg-primary text-primary-foreground border-transparent"
              : "bg-primary-soft text-primary-text",
        )}
      >
        EQ
      </PopoverTrigger>
      <PopoverContent align="end" className="grid w-64 gap-3">
        <div className="flex items-center justify-between gap-2">
          <span className="eyebrow truncate">{name} EQ</span>
          <button
            type="button"
            disabled={flat}
            onClick={() => onChange(FLAT_EQ)}
            className="text-fg-muted hover:text-fg flex items-center gap-1 text-xs font-semibold disabled:opacity-40"
          >
            <RotateCcw className="size-3.5" />
            Reset
          </button>
        </div>
        {EQ_BANDS.map((band) => (
          <label key={band.key} className="grid gap-1 text-xs">
            <span className="flex items-baseline justify-between gap-2">
              <span className="font-semibold">
                {band.label} <span className="text-fg-faint font-normal">{band.hint}</span>
              </span>
              <span className="text-fg-muted tabular-nums">{signed(value[band.key])}</span>
            </span>
            <input
              type="range"
              aria-label={`${name} ${band.label.toLowerCase()}`}
              title="Double-click to reset"
              min={-EQ_RANGE}
              max={EQ_RANGE}
              step={0.5}
              value={value[band.key]}
              onChange={(event) =>
                onChange({ ...value, [band.key]: clampEq(Number(event.target.value)) })
              }
              onDoubleClick={() => onChange({ ...value, [band.key]: 0 })}
              className="accent-primary w-full"
            />
          </label>
        ))}
      </PopoverContent>
    </Popover>
  );
}
