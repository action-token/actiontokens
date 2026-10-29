"use client";

import { create } from "zustand";

export type Side = "left" | "right";

export const DEFAULT_WIDTHS: Record<Side, number> = { left: 260, right: 320 };
export const LIMITS: Record<Side, { min: number; max: number }> = {
  left: { min: 200, max: 420 },
  right: { min: 260, max: 520 },
};
const STEP = 16;
const STORAGE_KEY = "bandcoin.panel-widths";

export function clampWidth(side: Side, px: number) {
  if (!Number.isFinite(px)) return DEFAULT_WIDTHS[side];
  return Math.min(LIMITS[side].max, Math.max(LIMITS[side].min, Math.round(px)));
}

/** The width after dragging the handle by `delta` px (positive = pointer moved right). */
export const widthFromDrag = (side: Side, start: number, delta: number) =>
  clampWidth(side, side === "left" ? start + delta : start - delta);

/** Arrow keys on a focused handle; the arrow points where the handle moves. null for any other key. */
export function nudge(side: Side, width: number, key: string) {
  if (key !== "ArrowLeft" && key !== "ArrowRight") return null;
  const handleMovesRight = key === "ArrowRight";
  return clampWidth(side, side === "left" ? width + (handleMovesRight ? STEP : -STEP) : width + (handleMovesRight ? -STEP : STEP));
}

type State = {
  widths: Record<Side, number>;
  set: (side: Side, px: number) => void;
  reset: (side: Side) => void;
  /** Read the saved widths once the page is in the browser (not during render, so server and client agree). */
  load: () => void;
};

const save = (widths: Record<Side, number>) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(widths));
  } catch {
    // Private mode or blocked storage: the widths just don't stick.
  }
};

export const usePanelWidths = create<State>((set, get) => ({
  widths: DEFAULT_WIDTHS,
  set: (side, px) => {
    const widths = { ...get().widths, [side]: clampWidth(side, px) };
    set({ widths });
    save(widths);
  },
  reset: (side) => get().set(side, DEFAULT_WIDTHS[side]),
  load: () => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<Record<Side, number>> | null;
      if (saved) set({ widths: { left: clampWidth("left", saved.left ?? NaN), right: clampWidth("right", saved.right ?? NaN) } });
    } catch {
      // Unreadable saved value: keep the defaults.
    }
  },
}));
