import { AppError, ErrorCodes } from "@bandcoin/errors";

/**
 * Last.fm track lookup for the music-bounty picker, as the old Bandcoin had it:
 * search any track, or list an artist's five top tracks. Reads need only the
 * API key (LASTFM_API_KEY, or the old NEXT_PUBLIC_LASTFM_API_KEY).
 */
const API = "https://ws.audioscrobbler.com/2.0/";
/** Last.fm's grey star, sent when a track has no artwork. */
const NO_ARTWORK = "2a96cbd8b46e442fc41c2b86b821562f";

export type FoundTrack = {
  id: string;
  title: string;
  artistName: string;
  albumArtUrl: string | null;
  durationSec: number;
  lastFmUrl: string;
};

type Image = { "#text"?: string; size?: string };
type RawTrack = {
  name: string;
  url?: string;
  artist?: string | { name?: string };
  image?: Image[];
};

const SIZES = ["extralarge", "large", "medium", "small"];

/** The biggest real picture in Last.fm's image list; null when it only has the placeholder. */
export function artworkOf(images: Image[] | undefined): string | null {
  const real = (images ?? []).filter(
    (image) => image["#text"]?.startsWith("http") && !image["#text"].includes(NO_ARTWORK),
  );
  for (const size of SIZES) {
    const found = real.find((image) => image.size === size);
    if (found?.["#text"]) return found["#text"];
  }
  return real[0]?.["#text"] ?? null;
}

const asList = <T>(value: T | T[] | undefined): T[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

function apiKey() {
  const key = process.env.LASTFM_API_KEY ?? process.env.NEXT_PUBLIC_LASTFM_API_KEY;
  if (!key)
    throw new AppError(ErrorCodes.CONFIG_MISSING, {
      message: "Last.fm isn't set up yet.",
      details: { name: "LASTFM_API_KEY" },
    });
  return key;
}

async function call(
  params: Record<string, string>,
  fetcher: typeof fetch,
): Promise<Record<string, unknown> | null> {
  const url = `${API}?${new URLSearchParams({ ...params, api_key: apiKey(), format: "json" })}`;
  try {
    const res = await fetcher(url, { headers: { "User-Agent": "Bandcoin/1.0" } });
    return res.ok ? ((await res.json()) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** A track with no picture of its own borrows its album's. */
async function withArtwork(
  raw: RawTrack,
  artistName: string,
  fetcher: typeof fetch,
): Promise<string | null> {
  const own = artworkOf(raw.image);
  if (own) return own;
  const info = (await call(
    { method: "track.getinfo", artist: artistName, track: raw.name },
    fetcher,
  )) as { track?: { album?: { image?: Image[] } } } | null;
  return artworkOf(info?.track?.album?.image);
}

async function toFound(
  raw: RawTrack,
  fallbackArtist: string,
  index: number,
  durationSec: number,
  fetcher: typeof fetch,
): Promise<FoundTrack> {
  const artistName =
    (typeof raw.artist === "string" ? raw.artist : raw.artist?.name) ?? fallbackArtist;
  return {
    id: `${index}-${raw.name.replace(/[^a-zA-Z0-9]/g, "-")}`,
    title: raw.name,
    artistName,
    albumArtUrl: await withArtwork(raw, artistName, fetcher),
    durationSec,
    lastFmUrl:
      raw.url ??
      `https://www.last.fm/music/${encodeURIComponent(artistName)}/_/${encodeURIComponent(raw.name)}`,
  };
}

export async function searchTracks(
  query: string,
  fetcher: typeof fetch = fetch,
): Promise<FoundTrack[]> {
  if (!query.trim()) return [];
  const data = (await call({ method: "track.search", track: query, limit: "15" }, fetcher)) as {
    results?: { trackmatches?: { track?: RawTrack | RawTrack[] } };
  } | null;
  const matches = asList(data?.results?.trackmatches?.track);
  return Promise.all(
    matches.map((raw, index) => toFound(raw, "Unknown artist", index, 180, fetcher)),
  );
}

export async function topTracks(
  artist: string,
  fetcher: typeof fetch = fetch,
): Promise<FoundTrack[]> {
  if (!artist.trim()) return [];
  const data = (await call({ method: "artist.gettoptracks", artist, limit: "5" }, fetcher)) as {
    toptracks?: { track?: RawTrack | RawTrack[] };
  } | null;
  return Promise.all(
    asList(data?.toptracks?.track)
      .slice(0, 5)
      .map((raw, index) => toFound(raw, artist, index, 210, fetcher)),
  );
}
