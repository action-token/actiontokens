import { create } from "zustand";

/** Which form is open as a floating card on the Pins map (plan 44). */
export type MapFormCard =
  | { kind: "newPin" }
  | { kind: "editPin"; id: string }
  | { kind: "newHotspot" }
  | { kind: "editHotspot"; id: string };

/** The pin in the card as it will look on the map: what its Look tab has chosen so far. */
export type DraftPin = {
  path: string;
  anchor: "center" | "bottom";
  color: string | null;
  imageUrl: string | null;
  imageFit: { zoom: number; x: number; y: number } | null;
  badge: boolean;
};

/**
 * The Pins map's form card, and the spot last clicked while it is open (where a new pin goes).
 * Not saved: the map always opens with no card.
 */
export const useMapFormCard = create<{
  card: MapFormCard | null;
  at: { lat: number; lng: number } | null;
  /** How the pin being made looks right now, drawn at `at` (set by the pin form). */
  draft: DraftPin | null;
  setDraft: (draft: DraftPin | null) => void;
  /** The area a new hotspot is being made over, drawn on the map while its card is open. */
  draftArea: { feature: unknown } | null;
  setDraftArea: (area: { feature: unknown } | null) => void;
  open: (card: MapFormCard, at?: { lat: number; lng: number } | null) => void;
  moveTo: (at: { lat: number; lng: number }) => void;
  close: () => void;
}>((set) => ({
  card: null,
  at: null,
  draft: null,
  setDraft: (draft) => set({ draft }),
  draftArea: null,
  setDraftArea: (draftArea) => set({ draftArea }),
  open: (card, at = null) => set({ card, at, draft: null, draftArea: null }),
  moveTo: (at) => set({ at }),
  close: () => set({ card: null, at: null, draft: null, draftArea: null }),
}));
