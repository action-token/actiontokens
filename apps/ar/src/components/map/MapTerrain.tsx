"use client";

import { MapTerrainLayers } from "@actiontokens/map/terrain";

import { isStandardStyle, useMapBase, useMapMode, useMapTerrain } from "~/lib/ar/theme";

/**
 * Terrain on AR's maps: on when the viewer switched it on (Profile › Settings › Map), or `force`d
 * (a Hike trail). The layers themselves are shared with the artist portal.
 */
export function MapTerrain({ force = false }: { force?: boolean }) {
  const on = useMapTerrain() || force;
  const standard = isStandardStyle(useMapMode(), useMapBase());
  return <MapTerrainLayers on={on} standard={standard} />;
}
