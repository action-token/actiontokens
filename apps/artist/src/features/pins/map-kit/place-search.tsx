"use client";

import { Crosshair, Loader2, MapPin, Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { parseCoordinates, type LatLng } from "@actiontokens/geo/map-geometry";
import { cn } from "@actiontokens/ui/lib/cn";

import { MAPBOX_TOKEN, type Place } from "../mapbox";

type GeocodeFeature = {
  properties: {
    name?: string;
    full_address?: string;
    place_formatted?: string;
    coordinates: { latitude: number; longitude: number };
  };
};

/**
 * Place search on Mapbox geocoding. Typing a coordinate pair ("23.81, 90.41")
 * jumps straight to it. Arrow keys and Enter pick a suggestion.
 */
export function PlaceSearch({
  onSelect,
  placeholder = "Search a place or paste coordinates",
  className,
  proximity,
}: {
  onSelect: (place: Place) => void;
  placeholder?: string;
  className?: string;
  /** Bias results near here (e.g. the map centre). */
  proximity?: LatLng;
}) {
  const listId = useId();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Place[]>([]);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  const coords = parseCoordinates(q);

  useEffect(() => {
    const token = MAPBOX_TOKEN;
    if (coords || q.trim().length < 3 || !token) return;
    const request = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      const url = new URL("https://api.mapbox.com/search/geocode/v6/forward");
      url.searchParams.set("q", q.trim());
      url.searchParams.set("limit", "6");
      url.searchParams.set("access_token", token);
      url.searchParams.set("proximity", proximity ? `${proximity.lng},${proximity.lat}` : "ip");
      fetch(url, { signal: request.signal })
        .then((response) => response.json() as Promise<{ features?: GeocodeFeature[] }>)
        .then((data) => {
          setResults(
            (data.features ?? []).map((feature) => ({
              name: feature.properties.name ?? feature.properties.full_address ?? "Place",
              address: feature.properties.place_formatted ?? feature.properties.full_address,
              lat: feature.properties.coordinates.latitude,
              lng: feature.properties.coordinates.longitude,
            })),
          );
          setActive(0);
        })
        .catch(() => undefined)
        .finally(() => setLoading(false));
    }, 250);
    return () => {
      clearTimeout(timer);
      request.abort();
    };
    // Only the text starts a search; the bias point moving shouldn't.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  useEffect(() => {
    const onDown = (event: MouseEvent) =>
      !box.current?.contains(event.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const options: Place[] = coords
    ? [
        {
          ...coords,
          name: `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`,
          address: "Coordinates",
        },
      ]
    : q.trim().length < 3
      ? []
      : results;
  const choose = (place: Place) => {
    onSelect(place);
    setQ(place.name);
    setOpen(false);
  };

  return (
    <div ref={box} className={cn("relative", className)}>
      <div className="bg-surface focus-within:ring-ring flex h-10 items-center gap-2 rounded-lg border px-3 shadow-sm focus-within:ring-2">
        <Search className="text-fg-muted size-4 shrink-0" />
        <input
          value={q}
          onChange={(event) => {
            setQ(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (!options.length) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((index) => (index + 1) % options.length);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((index) => (index - 1 + options.length) % options.length);
            } else if (event.key === "Enter") {
              event.preventDefault();
              const picked = options[active];
              if (picked) choose(picked);
            } else if (event.key === "Escape") setOpen(false);
          }}
          placeholder={placeholder}
          className="placeholder:text-fg-faint h-full min-w-0 flex-1 bg-transparent text-sm outline-none"
          role="combobox"
          aria-label="Search for a place"
          aria-expanded={open && options.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
        />
        {loading && <Loader2 className="text-fg-muted size-4 animate-spin" />}
        {q && !loading && (
          <button
            type="button"
            onClick={() => {
              setQ("");
              setResults([]);
            }}
            aria-label="Clear search"
            className="text-fg-muted hover:text-fg"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
      {open && options.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="bg-surface absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-lg border shadow-lg"
        >
          {options.map((place, index) => (
            <li
              key={`${place.lat},${place.lng},${index}`}
              role="option"
              aria-selected={index === active}
            >
              <button
                type="button"
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(place)}
                className={cn(
                  "flex w-full items-start gap-2.5 px-3 py-2 text-left",
                  index === active && "bg-surface-2",
                )}
              >
                {coords ? (
                  <Crosshair className="text-primary-text mt-0.5 size-4 shrink-0" />
                ) : (
                  <MapPin className="text-fg-muted mt-0.5 size-4 shrink-0" />
                )}
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{place.name}</span>
                  {place.address && (
                    <span className="text-fg-muted block truncate text-xs">{place.address}</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
