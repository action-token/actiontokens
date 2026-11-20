import type { LatLng } from "@actiontokens/geo/map-geometry";

/** The public Mapbox token; without it the map is replaced by typed coordinates. */
export const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_API;

export type Place = LatLng & { name: string; address?: string };

type Geocoded = { features?: { place_name: string }[] };

/** A short name for a point ("Dhanmondi, Dhaka"), or null when none is known. */
export async function placeName(
  { lat, lng }: LatLng,
  signal?: AbortSignal,
): Promise<string | null> {
  if (!MAPBOX_TOKEN) return null;
  const query = new URLSearchParams({
    limit: "1",
    types: "poi,neighborhood,locality,place",
    access_token: MAPBOX_TOKEN,
  });
  const response = await fetch(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?${query}`,
    { signal },
  );
  if (!response.ok) return null;
  return ((await response.json()) as Geocoded).features?.[0]?.place_name ?? null;
}
