import type { DrawnArea } from "./area-draw";

/**
 * The area just drawn on the Pins map, handed to the new hotspot form on the
 * next page. It lives only in the running page (a reload starts afresh), goes
 * stale after a couple of minutes, and is dropped once the hotspot is saved.
 */
const FRESH_MS = 2 * 60_000;
let draft: { area: DrawnArea; at: number } | null = null;

export const setAreaDraft = (area: DrawnArea) => {
  draft = { area, at: Date.now() };
};
export const peekAreaDraft = () => (draft && Date.now() - draft.at < FRESH_MS ? draft.area : null);
export const clearAreaDraft = () => {
  draft = null;
};
