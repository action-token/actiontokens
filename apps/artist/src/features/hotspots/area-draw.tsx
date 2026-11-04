"use client";

import { Circle, Hexagon, MapPinOff, RectangleHorizontal, RotateCcw } from "lucide-react";
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { Layer, Marker, Source, type MapRef } from "react-map-gl/mapbox";

import { Button } from "@bandcoin/ui/components/button";
import { cn } from "@bandcoin/ui/lib/cn";
import {
  areaBounds,
  circleFeature,
  featureCenter,
  haversineMetres,
  type LatLng,
  polygonFeature,
  rectangleFeature,
  type StoredFeature,
  toMapboxFeature,
} from "@bandcoin/geo/map-geometry";

import { BaseMap, WORLD_VIEW } from "../pins/map-kit/base-map";
import { PlaceSearch } from "../pins/map-kit/place-search";
import { MAPBOX_TOKEN } from "../pins/mapbox";

export type AreaShape = "circle" | "rectangle" | "polygon";
export type DrawnArea = { shape: AreaShape; feature: StoredFeature };

export const AREA = "#dbdc2c";
export const SHAPES: { value: AreaShape; label: string; icon: typeof Circle; hint: string }[] = [
  { value: "circle", label: "Circle", icon: Circle, hint: "Click the centre, then the edge." },
  {
    value: "rectangle",
    label: "Rectangle",
    icon: RectangleHorizontal,
    hint: "Click one corner, then the opposite one.",
  },
  {
    value: "polygon",
    label: "Shape",
    icon: Hexagon,
    hint: "Click each corner, then Finish (or click the first point).",
  },
];

/** "1.2 km" / "350 m": how far the area reaches from its centre. */
export function areaReach(feature: StoredFeature) {
  const center = featureCenter(feature);
  const ring = feature.geometry.coordinates[0] ?? [];
  const metres = Math.max(
    0,
    ...ring.map(([lat, lng]) => haversineMetres(center, { lat: lat!, lng: lng! })),
  );
  return metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${Math.round(metres)} m`;
}

function draftFeature(shape: AreaShape, points: LatLng[], hover: LatLng | null) {
  const all = hover ? [...points, hover] : points;
  if (shape === "circle" && points.length === 1 && hover) return circleFeature(points[0]!, hover);
  if (shape === "rectangle" && points.length === 1 && hover)
    return rectangleFeature(points[0]!, hover);
  if (shape === "polygon" && all.length >= 3) return polygonFeature(all);
  return null;
}

/**
 * The drawing itself, for any map: click a circle's centre then its edge, a
 * rectangle's two corners, or each corner of a shape (clicking near the first
 * point closes it). `onFinish` gets the stored feature.
 */
export function useAreaDrawing(
  map: RefObject<MapRef | null>,
  shape: AreaShape,
  onFinish: (feature: StoredFeature) => void,
) {
  const [points, setPoints] = useState<LatLng[]>([]);
  const [hover, setHover] = useState<LatLng | null>(null);
  const drawing = points.length > 0;

  const reset = () => {
    setPoints([]);
    setHover(null);
  };
  const finish = (feature: StoredFeature) => {
    onFinish(feature);
    reset();
  };

  /** About 12 screen pixels at the current zoom, in metres. */
  const closeEnough = () => (156_543 / 2 ** (map.current?.getZoom() ?? 14)) * 12;

  const click = (at: LatLng) => {
    if (shape === "circle" || shape === "rectangle") {
      if (points.length === 0) return setPoints([at]);
      return finish(
        shape === "circle" ? circleFeature(points[0]!, at) : rectangleFeature(points[0]!, at),
      );
    }
    const first = points[0];
    if (first && points.length >= 3 && haversineMetres(first, at) < closeEnough())
      return finish(polygonFeature(points));
    setPoints([...points, at]);
  };

  const draft = drawing ? draftFeature(shape, points, hover) : null;
  return {
    points,
    drawing,
    draftShape: draft ? toMapboxFeature(draft) : null,
    click,
    move: (at: LatLng) => drawing && setHover(at),
    finishShape: () => finish(polygonFeature(points)),
    reset,
  };
}

/** The dashed outline and corner dots of a drawing in progress. Goes inside a map. */
export function DrawingLayers({
  draftShape,
  points,
}: {
  draftShape: ReturnType<typeof toMapboxFeature>;
  points: LatLng[];
}) {
  return (
    <>
      {draftShape && (
        <Source id="hotspot-draft" type="geojson" data={draftShape}>
          <Layer
            id="hotspot-draft-fill"
            type="fill"
            paint={{ "fill-color": AREA, "fill-opacity": 0.12 }}
          />
          <Layer
            id="hotspot-draft-line"
            type="line"
            paint={{ "line-color": AREA, "line-width": 2, "line-dasharray": [2, 1] }}
          />
        </Source>
      )}
      {points.map((point, index) => (
        <Marker key={index} latitude={point.lat} longitude={point.lng} anchor="center">
          <span className="bg-fg block size-2.5 rounded-full border-2 border-white shadow" />
        </Marker>
      ))}
    </>
  );
}

/**
 * Draw where a hotspot's pins drop: a circle, a rectangle or any shape, on the
 * portal's map. The drawing is stored in the portal's usual format (see
 * @bandcoin/geo/map-geometry). `drops` shows recent spots for context.
 */
export function AreaDraw({
  value,
  onChange,
  drops = [],
  className,
}: {
  value: DrawnArea | null;
  onChange: (next: DrawnArea | null) => void;
  drops?: { latitude: number; longitude: number }[];
  className?: string;
}) {
  const map = useRef<MapRef>(null);
  const [shape, setShape] = useState<AreaShape>(value?.shape ?? "circle");
  const { points, drawing, draftShape, click, move, finishShape, reset } = useAreaDrawing(
    map,
    shape,
    (feature) => onChange({ shape, feature }),
  );

  // Open on the drawn area when editing.
  const initialBounds = useMemo(() => (value ? areaBounds([value.feature]) : null), []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (initialBounds || value) return;
    navigator.geolocation?.getCurrentPosition((position) =>
      map.current?.flyTo({
        center: [position.coords.longitude, position.coords.latitude],
        zoom: 13,
        duration: 600,
      }),
    );
  }, [initialBounds, value]);

  const committed = value ? toMapboxFeature(value.feature) : null;
  const hint = SHAPES.find((entry) => entry.value === shape)!.hint;

  if (!MAPBOX_TOKEN)
    return (
      <div className="bg-surface-2 text-fg-muted grid h-72 place-items-center rounded-xl border p-6 text-center text-sm">
        <span className="grid justify-items-center gap-2">
          <MapPinOff className="size-6" />
          Add a Mapbox token (NEXT_PUBLIC_MAPBOX_API) to draw hotspots.
        </span>
      </div>
    );

  return (
    <div className={cn("grid gap-3", className)}>
      <div role="radiogroup" aria-label="Area shape" className="flex flex-wrap gap-2">
        {SHAPES.map((entry) => (
          <button
            key={entry.value}
            type="button"
            role="radio"
            aria-checked={shape === entry.value}
            onClick={() => {
              setShape(entry.value);
              reset();
            }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
              shape === entry.value
                ? "bg-primary text-primary-foreground border-fg"
                : "bg-surface hover:bg-surface-2 text-fg-muted hover:text-fg",
            )}
          >
            <entry.icon className="size-4" /> {entry.label}
          </button>
        ))}
      </div>

      <div className="bg-surface-2 relative h-80 overflow-hidden rounded-xl border">
        <BaseMap
          ref={map}
          initialViewState={
            initialBounds
              ? { bounds: initialBounds, fitBoundsOptions: { padding: 40 } }
              : { ...WORLD_VIEW, zoom: 2 }
          }
          cursor="crosshair"
          doubleClickZoom={false}
          onClick={(event) => click({ lat: event.lngLat.lat, lng: event.lngLat.lng })}
          onMouseMove={(event) => move({ lat: event.lngLat.lat, lng: event.lngLat.lng })}
        >
          {committed && !drawing && (
            <Source id="hotspot-area" type="geojson" data={committed}>
              <Layer
                id="hotspot-area-fill"
                type="fill"
                paint={{ "fill-color": AREA, "fill-opacity": 0.2 }}
              />
              <Layer
                id="hotspot-area-line"
                type="line"
                paint={{ "line-color": AREA, "line-width": 2.5 }}
              />
            </Source>
          )}
          <DrawingLayers draftShape={draftShape} points={points} />
          {drops.map((spot, index) => (
            <Marker
              key={`drop-${index}`}
              latitude={spot.latitude}
              longitude={spot.longitude}
              anchor="center"
            >
              <span className="bg-primary-strong block size-2 rounded-full border border-white" />
            </Marker>
          ))}
        </BaseMap>
        <PlaceSearch
          className="absolute inset-x-2 top-2 z-10 sm:right-auto sm:w-72"
          onSelect={(place) =>
            map.current?.flyTo({ center: [place.lng, place.lat], zoom: 14, duration: 600 })
          }
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <p className="text-fg-muted mr-auto text-xs">
          {drawing
            ? hint
            : value
              ? `${SHAPES.find((entry) => entry.value === value.shape)?.label} drawn · reaches ${areaReach(value.feature)} from its centre. Draw again to replace it.`
              : hint}
        </p>
        {shape === "polygon" && points.length >= 3 && (
          <Button type="button" size="sm" onClick={finishShape}>
            Finish shape
          </Button>
        )}
        {(drawing || value) && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              reset();
              if (!drawing) onChange(null);
            }}
          >
            <RotateCcw /> {drawing ? "Cancel" : "Clear"}
          </Button>
        )}
      </div>
    </div>
  );
}
