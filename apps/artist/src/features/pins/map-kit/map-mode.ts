import { useSyncExternalStore } from "react";

import { createMapPrefs } from "@bandcoin/map/prefs";

/**
 * The portal's map choices (2D / 3D, map type, terrain), shared by every portal map and kept per
 * device under `bandcoin-artist-map-*`. The styles and how they are picked are shared with the AR
 * app (`@bandcoin/map`).
 */
export {
  isStandardStyle,
  MAP_BASE_LABEL,
  MAP_BASES,
  MAP_STYLE_2D,
  MAP_STYLE_3D,
  mapStyleFor,
  type MapBase,
  type MapMode,
} from "@bandcoin/map/style";

const prefs = createMapPrefs("bandcoin-artist");

export const MAP_MODE_STORAGE_KEY = prefs.keys.mode;
export const useMapMode = prefs.useMapMode;
export const setMapMode = prefs.setMapMode;
export const useMapBase = prefs.useMapBase;
export const setMapBase = prefs.setMapBase;
export const useMapTerrain = prefs.useMapTerrain;
export const setMapTerrain = prefs.setMapTerrain;

const noSubscribe = () => () => undefined;

/** False while rendering on the server and during hydration, true afterwards. */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
}
