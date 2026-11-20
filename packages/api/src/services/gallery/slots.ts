/**
 * The museum's fixed frames. A room has 18 slots: four on the front wall and four on the back
 * wall (these can slide between the wall's four cells), two on each side wall, and three
 * freestanding panels with a face each way. Only the front and back slots use `gridCell`.
 */
export const WALL_CELLS = 4;

export const SLOT_IDS = [
  ...Array.from({ length: WALL_CELLS }, (_, i) => `m-front-${i}`),
  ...Array.from({ length: WALL_CELLS }, (_, i) => `m-back-${i}`),
  "m-east-near",
  "m-east-far",
  "m-west-near",
  "m-west-far",
  ...[1, 2, 3].flatMap((panel) => [`m-p${panel}-n`, `m-p${panel}-s`]),
] as const;

const KNOWN = new Set<string>(SLOT_IDS);
export const isSlotId = (value: string) => KNOWN.has(value);

export type Wall = "front" | "back";

/** The slots that sit on the front or back wall, and where they hang until moved. */
export function wallSlot(slotId: string): { wall: Wall; defaultCell: number } | null {
  const match = /^m-(front|back)-([0-3])$/.exec(slotId);
  return match ? { wall: match[1] as Wall, defaultCell: Number(match[2]) } : null;
}

/** The cell a wall slot is in now: where it was moved to, or its own number. */
export const cellOf = (slotId: string, gridCell: number | null | undefined) =>
  gridCell ?? wallSlot(slotId)?.defaultCell ?? null;

export const ASPECT_RATIOS = ["16:9", "1:1", "9:16"] as const;
export const DESC_PLACEMENTS = ["left", "right"] as const;
