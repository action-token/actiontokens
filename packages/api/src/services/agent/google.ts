import { AppError, ErrorCodes } from "@actiontokens/errors";
import { uploadBufferToS3 } from "@actiontokens/storage";

import { boxSpanKm, tiles, type Box } from "./area";
import type { PlaceItem } from "./contract";
import { cached, cacheKey } from "./geo-cache";
import { geocodeOsm } from "./osm";

/**
 * Google Geocoding and Places (New) text search, server side only. Searches
 * are restricted to a box, so "parks" in a searched area never returns parks
 * elsewhere; big boxes are searched tile by tile. Results are cached.
 */
const key = () => {
  const value = process.env.GOOGLE_MAP_API_KEY;
  if (!value)
    throw new AppError(ErrorCodes.CONFIG_MISSING, { message: "Place search isn't set up yet." });
  return value;
};

/** Google returns at most 60 results (3 pages of 20) per text search. */
const MAX_PER_SEARCH = 60;
const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

/** Runs `work` over `items`, `size` at a time. */
export async function inBatches<T, R>(
  items: T[],
  size: number,
  work: (item: T, index: number) => Promise<R>,
) {
  const out: R[] = [];
  for (let at = 0; at < items.length; at += size)
    out.push(
      ...(await Promise.all(items.slice(at, at + size).map((item, i) => work(item, at + i)))),
    );
  return out;
}

// ─── Geocoding ──────────────────────────────────────────────────────────────

type Bounds = { northeast: { lat: number; lng: number }; southwest: { lat: number; lng: number } };
type GeocodeResponse = {
  status: string;
  results?: {
    formatted_address?: string;
    geometry?: { location?: { lat: number; lng: number }; bounds?: Bounds; viewport?: Bounds };
  }[];
};
export type Geocoded = { name: string; lat: number; lng: number; box: Box };

/** Where a place name is: its point and extent. Google first, OpenStreetMap when Google can't place it. */
export function geocode(address: string): Promise<Geocoded | null> {
  const text = address.trim();
  if (!text) return Promise.resolve(null);
  return cached(
    cacheKey("v3", "geocode", text),
    async () => (await geocodeGoogle(text)) ?? geocodeOsm(text),
  );
}

async function geocodeGoogle(text: string): Promise<Geocoded | null> {
  const apiKey = process.env.GOOGLE_MAP_API_KEY;
  if (!apiKey) return null;
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", text);
  url.searchParams.set("key", apiKey);
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (!response) return null;
  const data = (await response.json()) as GeocodeResponse;
  const hit = data.results?.[0];
  const loc = hit?.geometry?.location;
  if (data.status !== "OK" || !loc) return null;
  const b = hit.geometry?.bounds ?? hit.geometry?.viewport;
  const box: Box = b
    ? {
        south: b.southwest.lat,
        west: b.southwest.lng,
        north: b.northeast.lat,
        east: b.northeast.lng,
      }
    : { south: loc.lat - 0.05, north: loc.lat + 0.05, west: loc.lng - 0.05, east: loc.lng + 0.05 };
  return { name: hit.formatted_address ?? text, lat: loc.lat, lng: loc.lng, box };
}

// ─── Places text search ─────────────────────────────────────────────────────

type NewPlace = {
  id?: string;
  displayName?: { text: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
};
export type FoundPlace = { id: string; title: string; address?: string; lat: number; lng: number };

async function searchBox(query: string, box: Box): Promise<FoundPlace[]> {
  const boxKey = [box.south, box.west, box.north, box.east].map((n) => n.toFixed(3)).join(",");
  const places = await cached(cacheKey("v3", "places", query, boxKey), async () => {
    const found: FoundPlace[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < MAX_PER_SEARCH / 20; page++) {
      // Every page repeats the first request exactly, plus its token.
      const body: Record<string, unknown> = {
        textQuery: query,
        pageSize: 20,
        languageCode: "en",
        locationRestriction: {
          rectangle: {
            low: { latitude: box.south, longitude: box.west },
            high: { latitude: box.north, longitude: box.east },
          },
        },
      };
      if (pageToken) body.pageToken = pageToken;
      const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": key(),
          "X-Goog-FieldMask":
            "places.id,places.displayName,places.formattedAddress,places.location,nextPageToken",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(12_000),
      });
      const data = (await response.json()) as { places?: NewPlace[]; nextPageToken?: string };
      // A first page that failed isn't cached.
      if (!response.ok) {
        if (page === 0) return null;
        break;
      }
      for (const p of data.places ?? [])
        if (p.id && p.location)
          found.push({
            id: p.id,
            title: p.displayName?.text ?? "Unnamed place",
            address: p.formattedAddress,
            lat: p.location.latitude,
            lng: p.location.longitude,
          });
      pageToken = data.nextPageToken;
      if (!pageToken) break;
      await sleep(300);
    }
    return found;
  });
  return places ?? [];
}

/** Places matching `query` inside `box`; big boxes and big limits are split into tiles. */
export async function searchPlaces(query: string, box: Box, limit: number): Promise<PlaceItem[]> {
  const span = boxSpanKm(box);
  const grid = limit > MAX_PER_SEARCH || span > 60 ? (limit > 120 || span > 150 ? 3 : 2) : 1;
  const batches = await inBatches(tiles(box, grid), 4, (tile) => searchBox(query, tile));
  const seen = new Set<string>();
  const out: PlaceItem[] = [];
  for (const p of batches.flat()) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    out.push({
      key: p.id,
      gPlaceId: p.id,
      title: p.title,
      address: p.address,
      lat: p.lat,
      lng: p.lng,
      kind: "place",
    });
  }
  return out.slice(0, limit);
}

/** Best match for a named place (e.g. a landmark from a web list) near `near`. */
export async function findPlace(name: string, near: string): Promise<FoundPlace | null> {
  const text = near ? `${name}, ${near}` : name;
  return cached(cacheKey("v2", "place", text), async () => {
    const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key(),
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location",
      },
      body: JSON.stringify({ textQuery: text, pageSize: 1, languageCode: "en" }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    const p = ((await response.json()) as { places?: NewPlace[] }).places?.[0];
    if (!p?.id || !p.location) return null;
    return {
      id: p.id,
      title: p.displayName?.text ?? name,
      address: p.formattedAddress,
      lat: p.location.latitude,
      lng: p.location.longitude,
    };
  });
}

// ─── A place's photo ────────────────────────────────────────────────────────

/** A Google place's first photo, copied into our storage (null when it has none). */
export async function placePhoto(gPlaceId: string): Promise<string | null> {
  const details = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(gPlaceId)}?fields=photos`,
    { headers: { "X-Goog-Api-Key": key() }, signal: AbortSignal.timeout(10_000) },
  );
  if (!details.ok) return null;
  const photo = ((await details.json()) as { photos?: { name: string }[] }).photos?.[0]?.name;
  if (!photo) return null;
  const media = await fetch(
    `https://places.googleapis.com/v1/${photo}/media?maxWidthPx=1200&skipHttpRedirect=true`,
    { headers: { "X-Goog-Api-Key": key() }, signal: AbortSignal.timeout(10_000) },
  );
  if (!media.ok) return null;
  const uri = ((await media.json()) as { photoUri?: string }).photoUri;
  if (!uri) return null;
  const image = await fetch(uri, { signal: AbortSignal.timeout(15_000) });
  if (!image.ok) return null;
  const type = image.headers.get("content-type") ?? "image/jpeg";
  if (!type.startsWith("image/")) return null;
  return uploadBufferToS3(Buffer.from(await image.arrayBuffer()), type, {
    keyPrefix: "place-",
    placement: { owner: "shared", kind: "places" },
  });
}
