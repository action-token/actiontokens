"use client";

import "mapbox-gl/dist/mapbox-gl.css";

import { ExternalLink, MapPin } from "lucide-react";
import { useTheme } from "next-themes";
import { useState } from "react";
import MapGL, { Marker, NavigationControl, Popup } from "react-map-gl/mapbox";

import { directionsLink, placesView } from "./map-view";

/** Clear of the pin, which stands above its point; Mapbox picks the side that fits the map. */
const POPUP_OFFSET = {
  top: [0, 4],
  "top-left": [0, 4],
  "top-right": [0, 4],
  bottom: [0, -36],
  "bottom-left": [0, -36],
  "bottom-right": [0, -36],
  left: [18, -18],
  right: [-18, -18],
  center: [0, 0],
} satisfies Record<string, [number, number]>;

export type MapPlace = { lat: number; lng: number; label: string | null; reward: string };

/**
 * The places that unlock an item's rewards, as on the old Bandcoin. Tapping a
 * pin shows the place, what it unlocks and a link for directions. The page
 * keeps scrolling over it: moving the map takes two fingers, or ctrl and scroll.
 */
export default function PlacesMap({ places, token }: { places: MapPlace[]; token: string }) {
  const { resolvedTheme } = useTheme();
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const open = openIndex === null ? null : places[openIndex];

  return (
    <div className="h-72 overflow-hidden rounded-lg border">
      <MapGL
        mapboxAccessToken={token}
        mapStyle={`mapbox://styles/mapbox/${resolvedTheme === "dark" ? "dark" : "light"}-v11`}
        initialViewState={placesView(places)}
        style={{ width: "100%", height: "100%" }}
        cooperativeGestures
        maxPitch={0}
      >
        <NavigationControl position="bottom-right" showCompass={false} />
        {places.map((place, index) => (
          <Marker key={index} latitude={place.lat} longitude={place.lng} anchor="bottom">
            <button
              type="button"
              aria-label={`Show ${place.label ?? `place ${index + 1}`}`}
              onClick={(event) => {
                // The map would otherwise take this click and close the popup again.
                event.stopPropagation();
                setOpenIndex(index);
              }}
              className="flex size-8 items-center justify-center rounded-full border-2 border-white bg-amber-500 text-white shadow-md"
            >
              <MapPin className="size-4" />
            </button>
          </Marker>
        ))}
        {open && (
          <Popup
            latitude={open.lat}
            longitude={open.lng}
            offset={POPUP_OFFSET}
            focusAfterOpen={false}
            closeOnClick={false}
            onClose={() => setOpenIndex(null)}
          >
            <div className="grid gap-1 pr-3 text-xs text-neutral-900">
              <b>{open.label ?? `${open.lat.toFixed(4)}, ${open.lng.toFixed(4)}`}</b>
              <span className="text-neutral-600">Unlocks {open.reward}</span>
              <a
                href={directionsLink(open)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-amber-700 hover:underline"
              >
                Directions <ExternalLink className="size-3" />
              </a>
            </div>
          </Popup>
        )}
      </MapGL>
    </div>
  );
}
