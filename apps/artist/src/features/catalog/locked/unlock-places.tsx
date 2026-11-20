"use client";

import { MapPinOff, X } from "lucide-react";
import { useMemo, useRef } from "react";
import { Layer, Marker, Source, type MapRef } from "react-map-gl/mapbox";

import { circleAround, toMapboxFeature } from "@actiontokens/geo/map-geometry";
import { Input } from "@actiontokens/ui/components/input";
import { cn } from "@actiontokens/ui/lib/cn";

import { BaseMap, WORLD_VIEW } from "../../pins/map-kit/base-map";
import { PlaceSearch } from "../../pins/map-kit/place-search";
import { MAPBOX_TOKEN } from "../../pins/mapbox";
import { MAX_PLACES, type UnlockPlace } from "./drafts";

const AREA = "#dbdc2c";

/**
 * The places an owner must visit to unlock a piece: click the map or search to
 * add one (up to 20), drag a marker to move it, name it if you like. Without
 * `onChange` it only shows them (the edit page, and fans before buying).
 */
export function UnlockPlaces({
  places,
  radiusMeters,
  onChange,
  idPrefix,
}: {
  places: UnlockPlace[];
  radiusMeters: number;
  onChange?: (places: UnlockPlace[]) => void;
  idPrefix: string;
}) {
  const map = useRef<MapRef>(null);
  const editable = Boolean(onChange);
  const full = places.length >= MAX_PLACES;

  const add = (lat: number, lng: number, label = "") => {
    if (!onChange || full) return;
    onChange([...places, { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)), label }]);
  };
  const move = (index: number, lat: number, lng: number) =>
    onChange?.(
      places.map((place, at) =>
        at === index
          ? { ...place, lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) }
          : place,
      ),
    );

  const areas = useMemo(
    () =>
      radiusMeters > 0
        ? {
            type: "FeatureCollection" as const,
            features: places.flatMap((place) => {
              const feature = toMapboxFeature(
                circleAround({ lat: place.lat, lng: place.lng }, radiusMeters),
              );
              return feature ? [feature] : [];
            }),
          }
        : null,
    [places, radiusMeters],
  );
  const first = places[0];

  return (
    <div className="grid gap-3">
      {MAPBOX_TOKEN ? (
        <div className="bg-surface-2 relative h-64 overflow-hidden rounded-xl border">
          <BaseMap
            ref={map}
            controls="zoom"
            initialViewState={
              first ? { latitude: first.lat, longitude: first.lng, zoom: 14 } : WORLD_VIEW
            }
            onClick={editable ? (event) => add(event.lngLat.lat, event.lngLat.lng) : undefined}
            cursor={editable && !full ? "crosshair" : undefined}
          >
            {areas && (
              <Source id={`${idPrefix}-areas`} type="geojson" data={areas}>
                <Layer
                  id={`${idPrefix}-areas-fill`}
                  type="fill"
                  paint={{ "fill-color": AREA, "fill-opacity": 0.18 }}
                />
                <Layer
                  id={`${idPrefix}-areas-line`}
                  type="line"
                  paint={{ "line-color": AREA, "line-width": 2, "line-dasharray": [2, 1] }}
                />
              </Source>
            )}
            {places.map((place, index) => (
              <Marker
                key={index}
                latitude={place.lat}
                longitude={place.lng}
                anchor="center"
                draggable={editable}
                onDragEnd={(event) => move(index, event.lngLat.lat, event.lngLat.lng)}
              >
                <span className="bg-primary text-primary-ink flex size-6 items-center justify-center rounded-full border-2 border-white text-xs font-bold shadow">
                  {index + 1}
                </span>
              </Marker>
            ))}
          </BaseMap>
          {editable && (
            <div className="absolute inset-x-3 top-3 z-10">
              <PlaceSearch
                onSelect={(place) => {
                  add(place.lat, place.lng, place.name.slice(0, 80));
                  map.current?.flyTo({ center: [place.lng, place.lat], zoom: 15, duration: 700 });
                }}
                proximity={first ? { lat: first.lat, lng: first.lng } : undefined}
              />
            </div>
          )}
          {editable && (
            <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center">
              <span className="bg-surface/95 rounded-full border px-3 py-1 text-xs font-medium shadow">
                {full ? `Up to ${MAX_PLACES} places` : "Click the map to add a place"}
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-surface-2 text-fg-muted flex items-center gap-3 rounded-lg border p-4 text-sm">
          <MapPinOff className="text-fg-faint size-5 shrink-0" />
          The map needs a Mapbox token (NEXT_PUBLIC_MAPBOX_API).
        </div>
      )}

      {places.length > 0 && (
        <ol className="divide-y rounded-xl border">
          {places.map((place, index) => (
            <li key={index} className="flex items-center gap-3 p-2.5">
              <span className="bg-primary-soft text-primary-text flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                {editable ? (
                  <Input
                    aria-label={`Name of place ${index + 1}`}
                    id={`${idPrefix}-place-${index}`}
                    value={place.label}
                    maxLength={80}
                    placeholder="Name (optional)"
                    className="h-9"
                    onChange={(event) =>
                      onChange?.(
                        places.map((entry, at) =>
                          at === index ? { ...entry, label: event.target.value } : entry,
                        ),
                      )
                    }
                  />
                ) : (
                  place.label && <p className="truncate text-sm font-medium">{place.label}</p>
                )}
                <p className={cn("text-fg-muted font-mono text-xs", editable && "mt-1")}>
                  {place.lat.toFixed(5)}, {place.lng.toFixed(5)}
                </p>
              </div>
              {editable && (
                <button
                  type="button"
                  aria-label={`Remove place ${index + 1}`}
                  onClick={() => onChange?.(places.filter((_, at) => at !== index))}
                  className="text-fg-muted hover:text-fg hover:bg-surface-2 flex size-8 shrink-0 items-center justify-center rounded-md"
                >
                  <X className="size-4" />
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
