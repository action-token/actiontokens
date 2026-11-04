"use client";

import { useMemo } from "react";
import { Layer, Source } from "react-map-gl/mapbox";

import { toMapboxFeature } from "@bandcoin/geo/map-geometry";

import { AREA } from "./area-draw";

export const HOTSPOT_FILL = "hotspot-fill";

/**
 * Saved hotspot areas on the map, faded while paused or over. Give the map
 * `interactiveLayerIds={[HOTSPOT_FILL]}` and a click reports the area under it
 * in `event.features`.
 */
export function HotspotLayer({
  hotspots,
}: {
  hotspots: { id: string; geoJson: unknown; status: string }[];
}) {
  const data = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: hotspots.flatMap((hotspot) => {
        const feature = toMapboxFeature(hotspot.geoJson as Parameters<typeof toMapboxFeature>[0], {
          id: hotspot.id,
          live: hotspot.status === "ACTIVE" || hotspot.status === "SCHEDULED",
        });
        return feature ? [feature] : [];
      }),
    }),
    [hotspots],
  );

  return (
    <Source id="hotspots" type="geojson" data={data}>
      <Layer
        id={HOTSPOT_FILL}
        type="fill"
        paint={{ "fill-color": AREA, "fill-opacity": ["case", ["get", "live"], 0.2, 0.07] }}
      />
      <Layer
        id="hotspot-line"
        type="line"
        paint={{
          "line-color": AREA,
          "line-width": 2.5,
          "line-opacity": ["case", ["get", "live"], 0.95, 0.4],
        }}
      />
    </Source>
  );
}
