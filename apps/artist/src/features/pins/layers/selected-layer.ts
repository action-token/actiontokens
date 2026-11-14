import { create } from "zustand";

import { api, type RouterOutputs } from "~/trpc/react";

import { REGULAR } from "./layer-view";

/**
 * The layer picked on the Pins map (plan 42): the one the artist is "in". The map shows its pins
 * and hotspots, and new ones are made in it. Null = "No layer": the regular map.
 *
 * `shown` are other layers switched on with their eye (REGULAR for the regular map), shown
 * alongside it so several can be seen at once; what's made still goes in `id`. All off by
 * default. Not saved: the map always opens on No layer with nothing else shown.
 */
export const useSelectedLayer = create<{
  id: string | null;
  shown: string[];
  set: (id: string | null) => void;
  toggleShown: (key: string) => void;
}>((set) => ({
  id: null,
  shown: [],
  set: (id) => set({ id }),
  toggleShown: (key) =>
    set((state) => ({
      shown: state.shown.includes(key)
        ? state.shown.filter((entry) => entry !== key)
        : [...state.shown, key],
    })),
}));

export type ArtistLayer = RouterOutputs["layers"]["list"][number];

/** The artist's layers, by name (shared by the switcher and the forms). */
export function useArtistLayers() {
  return api.layers.list.useQuery(undefined, { staleTime: 30_000 });
}
