import type { Box } from "./area";

/**
 * OpenStreetMap's Nominatim, used when Google can't place a name. Its policy
 * allows about one request a second with an identifying User-Agent, so
 * requests are queued one at a time (answers are cached by the caller).
 */
const GAP_MS = 1100;
let last = Promise.resolve();

type Hit = { lat: string; lon: string; display_name: string; boundingbox?: string[] };

export async function geocodeOsm(
  text: string,
): Promise<{ name: string; lat: number; lng: number; box: Box } | null> {
  const turn = last.then(() => new Promise<void>((done) => setTimeout(done, GAP_MS)));
  last = turn;
  await turn;
  try {
    const query = new URLSearchParams({ q: text, format: "jsonv2", limit: "1" });
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${query.toString()}`, {
      headers: {
        "User-Agent": "Bandcoin map assistant (support@action-tokens.com)",
        "Accept-Language": "en",
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    const [hit] = (await response.json()) as Hit[];
    if (!hit) return null;
    const lat = Number(hit.lat);
    const lng = Number(hit.lon);
    const [s, n, w, e] = (hit.boundingbox ?? []).map(Number);
    const box: Box =
      s !== undefined &&
      n !== undefined &&
      w !== undefined &&
      e !== undefined &&
      [s, n, w, e].every(Number.isFinite)
        ? { south: s, north: n, west: w, east: e }
        : { south: lat - 0.05, north: lat + 0.05, west: lng - 0.05, east: lng + 0.05 };
    return { name: hit.display_name, lat, lng, box };
  } catch {
    return null;
  }
}
