"use client";

import { Minus, Plus } from "lucide-react";

import { cn } from "../lib/cn";

/** − n + control for picking how many copies to buy. */
export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max,
  disabled = false,
  className,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max: number;
  disabled?: boolean;
  className?: string;
}) {
  const buttonClass =
    "grid h-full place-items-center rounded-full transition-colors hover:bg-surface-3 disabled:cursor-not-allowed disabled:text-fg-faint disabled:hover:bg-transparent";

  return (
    <div
      className={cn(
        "bg-surface-2 inline-grid h-[42px] grid-cols-[40px_52px_40px] items-center rounded-full border",
        className,
      )}
    >
      <button
        type="button"
        aria-label="One less"
        className={buttonClass}
        disabled={disabled || value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <Minus className="size-4" />
      </button>
      <output aria-live="polite" className="num text-center text-[15px] font-semibold">
        {value}
      </output>
      <button
        type="button"
        aria-label="One more"
        className={buttonClass}
        disabled={disabled || value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}
