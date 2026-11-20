import { type MapLayerChip } from "@actiontokens/ar-core/layers";

import { api } from "~/trpc/react";

const NO_LAYERS: MapLayerChip[] = [];

/**
 * The layers a fan can turn on: artists' layers with live drops, by name. `loaded` is false until
 * the first answer, so a ticked layer isn't dropped while the list is loading.
 */
export function useMapLayers(): { layers: MapLayerChip[]; loaded: boolean } {
  const query = api.pin.layers.useQuery(undefined, {
    refetchOnWindowFocus: false,
    staleTime: 5 * 60_000,
  });
  return { layers: query.data ?? NO_LAYERS, loaded: query.data !== undefined };
}
