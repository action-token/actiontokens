/**
 * How a post's photos and videos sit in the grid, as on social apps: one
 * fills the width, two side by side, three as one big and two stacked, four
 * as a square, and more than four show the first four with "+N" on the last.
 */
export type MediaLayout = {
  shown: number;
  /** How many more open from the "+N" tile. */
  extra: number;
  grid: string;
  /** Classes for the tile at `index`. */
  cell: (index: number) => string;
};

export function mediaLayout(count: number): MediaLayout {
  if (count <= 1) return { shown: count, extra: 0, grid: "grid-cols-1", cell: () => "" };
  if (count === 2) return { shown: 2, extra: 0, grid: "aspect-[2/1] grid-cols-2", cell: () => "" };
  if (count === 3)
    return {
      shown: 3,
      extra: 0,
      grid: "aspect-[4/3] grid-cols-[3fr_2fr] grid-rows-2",
      cell: (index) => (index === 0 ? "row-span-2" : ""),
    };
  return {
    shown: 4,
    extra: count - 4,
    grid: "aspect-square grid-cols-2 grid-rows-2",
    cell: () => "",
  };
}

/** 0:42, 3:10, 1:02:05 */
export function clock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = String(whole % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}
