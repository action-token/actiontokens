import { create } from "zustand";

/**
 * Which drops the fan map shows (plan 42): the regular (layer-less) ones, and any artist layers
 * the fan ticked in the Layers sheet; several can be on at once. Regular drops are on and every
 * layer off by default. The map and the AR camera read the same choice, so they never disagree
 * about which drops are there.
 *
 * Not persisted: the map always opens on regular drops.
 */
export type LayerView = { regular: boolean; layers: readonly string[] };

export const DEFAULT_LAYER_VIEW: LayerView = { regular: true, layers: [] };

export const useMapLayer = create<{
  view: LayerView;
  toggleRegular: () => void;
  toggleLayer: (id: string) => void;
  /** Select all (regular + these layers) or deselect all. */
  setAll: (on: boolean, ids: readonly string[]) => void;
  /** Make sure a drop in this layer (null = regular) is shown: a search result, say. */
  reveal: (layerId: string | null) => void;
  /** Forget layers that no longer have live drops (no chip any more). */
  keepOnly: (ids: readonly string[]) => void;
}>()((set) => ({
  view: DEFAULT_LAYER_VIEW,
  toggleRegular: () => set((state) => ({ view: { ...state.view, regular: !state.view.regular } })),
  toggleLayer: (id) =>
    set((state) => ({
      view: {
        ...state.view,
        layers: state.view.layers.includes(id)
          ? state.view.layers.filter((entry) => entry !== id)
          : [...state.view.layers, id],
      },
    })),
  setAll: (on, ids) => set({ view: { regular: on, layers: on ? [...ids] : [] } }),
  reveal: (layerId) =>
    set((state) =>
      layerId === null
        ? state.view.regular
          ? state
          : { view: { ...state.view, regular: true } }
        : state.view.layers.includes(layerId)
          ? state
          : { view: { ...state.view, layers: [...state.view.layers, layerId] } },
    ),
  keepOnly: (ids) =>
    set((state) => {
      const layers = state.view.layers.filter((entry) => ids.includes(entry));
      return layers.length === state.view.layers.length
        ? state
        : { view: { ...state.view, layers } };
    }),
}));

/** How many layers are on (for the Layers button's badge), not counting regular drops. */
export function layersOn(view: LayerView): number {
  return view.layers.length;
}
