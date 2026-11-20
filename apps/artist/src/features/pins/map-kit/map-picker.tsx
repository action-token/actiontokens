"use client";

import { LocateFixed, MapPin, MapPinOff } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Layer, Marker, Source, type MapRef } from "react-map-gl/mapbox";
import toast from "react-hot-toast";

import { Input } from "@actiontokens/ui/components/input";
import { Label } from "@actiontokens/ui/components/label";
import { cn } from "@actiontokens/ui/lib/cn";
import { circleAround, toMapboxFeature, type LatLng } from "@actiontokens/geo/map-geometry";

import { useDebounced } from "~/lib/use-debounced";

import { MAPBOX_TOKEN, placeName, type Place } from "../mapbox";
import { BaseMap, WORLD_VIEW } from "./base-map";
import { PlaceSearch } from "./place-search";

export type MapSpot = { id: string; latitude: number; longitude: number; hidden?: boolean };

const AREA = "#dbdc2c";

/**
 * Pick one location for a form: click the map, drag the marker, search a place,
 * use your current location, or type coordinates. Shows the area the spots
 * scatter over. Without `onChange` it only shows the pin and its spots.
 */
export function MapPicker({
  value,
  onChange,
  radiusMetres,
  spots = [],
  className,
  showInputs = true,
  onPlace,
  marker,
}: {
  value: LatLng | null;
  onChange?: (point: LatLng) => void;
  radiusMetres?: number;
  spots?: MapSpot[];
  className?: string;
  showInputs?: boolean;
  /** Called with a name for the chosen point, for AI tag suggestions. */
  onPlace?: (name: string) => void;
  /** The pin as it will look (its shape and picture), and where it touches the map */
  marker?: { node: ReactNode; anchor: "center" | "bottom" };
}) {
  const map = useRef<MapRef>(null);
  const editable = Boolean(onChange);
  const [locating, setLocating] = useState(false);
  const [draft, setDraft] = useState({
    lat: value?.lat.toString() ?? "",
    lng: value?.lng.toString() ?? "",
  });

  // When the point moves (map click, search), show its coordinates in the inputs, adjusted during render.
  const pointKey = value ? `${value.lat},${value.lng}` : "";
  const [shownKey, setShownKey] = useState(pointKey);
  if (shownKey !== pointKey) {
    setShownKey(pointKey);
    setDraft({ lat: value?.lat.toFixed(6) ?? "", lng: value?.lng.toFixed(6) ?? "" });
  }

  const fly = (point: LatLng, zoom = 15) =>
    map.current?.flyTo({
      center: [point.lng, point.lat],
      zoom: Math.max(zoom, map.current.getZoom()),
      duration: 700,
    });
  const set = (point: LatLng, flyTo = false) => {
    onChange?.({ lat: Number(point.lat.toFixed(6)), lng: Number(point.lng.toFixed(6)) });
    if (flyTo) fly(point);
  };

  const area = useMemo(
    () =>
      value && radiusMetres && radiusMetres > 0
        ? toMapboxFeature(circleAround(value, radiusMetres))
        : null,
    [value, radiusMetres],
  );

  const settled = useDebounced(value, 700);
  useEffect(() => {
    if (!settled || !onPlace) return;
    const request = new AbortController();
    placeName(settled, request.signal)
      .then((name) => name && onPlace(name))
      .catch(() => undefined);
    return () => request.abort();
    // onPlace is the parent's setter; it never needs to re-run this
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled]);

  function commitDraft() {
    const lat = Number(draft.lat);
    const lng = Number(draft.lng);
    if (
      draft.lat !== "" &&
      draft.lng !== "" &&
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lng) <= 180
    )
      set({ lat, lng }, true);
  }

  function locate() {
    if (!navigator.geolocation) return void toast.error("This browser can't share your location.");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        set({ lat: position.coords.latitude, lng: position.coords.longitude }, true);
      },
      () => {
        setLocating(false);
        toast.error("Couldn't get your location. Allow it in the browser, or search instead.");
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  return (
    <div className={cn("grid gap-3", className)}>
      {MAPBOX_TOKEN ? (
        <div className="bg-surface-2 relative h-72 overflow-hidden rounded-xl border">
          <BaseMap
            ref={map}
            controls="zoom"
            initialViewState={
              value ? { latitude: value.lat, longitude: value.lng, zoom: 15 } : WORLD_VIEW
            }
            onClick={
              editable
                ? (event) => set({ lat: event.lngLat.lat, lng: event.lngLat.lng })
                : undefined
            }
            cursor={editable ? "crosshair" : undefined}
          >
            {area && (
              <Source id="picker-area" type="geojson" data={area}>
                <Layer
                  id="picker-area-fill"
                  type="fill"
                  paint={{ "fill-color": AREA, "fill-opacity": 0.18 }}
                />
                <Layer
                  id="picker-area-line"
                  type="line"
                  paint={{ "line-color": AREA, "line-width": 2, "line-dasharray": [2, 1] }}
                />
              </Source>
            )}
            {spots.map((spot) => (
              <Marker
                key={spot.id}
                longitude={spot.longitude}
                latitude={spot.latitude}
                anchor="center"
              >
                <span
                  className={cn(
                    "block size-3 rounded-full border-2 border-white shadow",
                    spot.hidden ? "bg-fg-faint" : "bg-primary-strong",
                  )}
                />
              </Marker>
            ))}
            {value && (
              <Marker
                latitude={value.lat}
                longitude={value.lng}
                anchor={marker?.anchor ?? "bottom"}
                draggable={editable}
                onDragEnd={(event) => set({ lat: event.lngLat.lat, lng: event.lngLat.lng })}
              >
                {marker?.node ?? (
                  <MapPin
                    className="fill-primary text-primary-ink size-9 drop-shadow-md"
                    strokeWidth={1.5}
                  />
                )}
              </Marker>
            )}
          </BaseMap>
          {editable && (
            <div className="absolute inset-x-3 top-3 z-10 flex gap-2">
              <PlaceSearch
                className="flex-1"
                onSelect={(place: Place) => {
                  set(place, true);
                  onPlace?.(place.name);
                }}
                proximity={value ?? undefined}
              />
              <button
                type="button"
                onClick={locate}
                className="bg-surface hover:bg-surface-2 flex size-10 shrink-0 items-center justify-center rounded-lg border shadow-sm"
                aria-label="Use my current location"
                title="Use my current location"
              >
                <LocateFixed
                  className={cn("size-4", locating && "text-primary-text animate-pulse")}
                />
              </button>
            </div>
          )}
          {editable && !value && (
            <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center">
              <span className="bg-surface/95 rounded-full border px-3 py-1 text-xs font-medium shadow">
                Click the map to place it
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-surface-2 text-fg-muted flex items-center gap-3 rounded-lg border p-4 text-sm">
          <MapPinOff className="text-fg-faint size-5 shrink-0" />
          The map needs a Mapbox token (NEXT_PUBLIC_MAPBOX_API). Type the coordinates below instead.
        </div>
      )}
      {showInputs && (
        <div className="grid grid-cols-2 gap-3">
          {(["lat", "lng"] as const).map((key) => (
            <div key={key} className="grid gap-1.5">
              <Label htmlFor={`picker-${key}`} className="text-fg-muted text-xs">
                {key === "lat" ? "Latitude" : "Longitude"}
              </Label>
              <Input
                id={`picker-${key}`}
                inputMode="decimal"
                value={draft[key]}
                disabled={!editable}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, [key]: event.target.value }))
                }
                onBlur={commitDraft}
                onKeyDown={(event) =>
                  event.key === "Enter" && (event.preventDefault(), commitDraft())
                }
                placeholder={key === "lat" ? "23.8103" : "90.4125"}
                className="font-mono text-sm"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
