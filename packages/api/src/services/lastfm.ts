import crypto from "node:crypto";

import { AppError, ErrorCodes } from "@actiontokens/errors";

/**
 * Last.fm, as the old Action Tokens used it for music bounties: connect an account
 * (web auth → session key) and count a user's scrobbles of a track since a
 * moment. Ported from bandfan `main` (src/lib/lastfm/api.ts and
 * pages/api/lastfm/callback.ts); the matching rules are unchanged.
 *
 * Keys: LASTFM_API_KEY / LASTFM_SHARED_SECRET (the old NEXT_PUBLIC_ names
 * still work, but the secret should not be public).
 */

const API = "https://ws.audioscrobbler.com/2.0/";

export function lastFmKeys(env: Record<string, string | undefined> = process.env) {
  const apiKey = env.LASTFM_API_KEY ?? env.NEXT_PUBLIC_LASTFM_API_KEY;
  const secret = env.LASTFM_SHARED_SECRET ?? env.NEXT_PUBLIC_LASTFM_SHARED_SECRET;
  if (!apiKey || !secret) {
    throw new AppError(ErrorCodes.CONFIG_MISSING, {
      message: "Last.fm isn't set up yet.",
      details: { name: "LASTFM_API_KEY / LASTFM_SHARED_SECRET" },
    });
  }
  return { apiKey, secret };
}

/** Where to send the browser so the user can approve Action Tokens on Last.fm. */
export const lastFmAuthUrl = (apiKey: string, callbackUrl: string) =>
  `https://www.last.fm/api/auth/?api_key=${apiKey}&cb=${encodeURIComponent(callbackUrl)}`;

type Json = Record<string, unknown>;

async function call(params: Record<string, string>, init?: RequestInit): Promise<Json> {
  const response = await fetch(
    `${API}?${new URLSearchParams({ ...params, format: "json" }).toString()}`,
    init,
  );
  const data = (await response.json()) as Json;
  if (!response.ok || "error" in data) {
    throw new AppError(ErrorCodes.EXTERNAL_SERVICE_FAILED, {
      message:
        typeof data.message === "string"
          ? `Last.fm: ${data.message}`
          : "Last.fm didn't answer. Try again.",
    });
  }
  return data;
}

const sign = (params: Record<string, string>, secret: string) =>
  crypto
    .createHash("md5")
    .update(
      Object.keys(params)
        .sort()
        .map((key) => `${key}${params[key]}`)
        .join("") + secret,
    )
    .digest("hex");

/** Trades the token from the auth redirect for a session, plus the profile shown on Action Tokens. */
export async function lastFmSession(token: string) {
  const { apiKey, secret } = lastFmKeys();
  const params = { method: "auth.getSession", token, api_key: apiKey };
  const data = await call({ ...params, api_sig: sign(params, secret) }, { method: "POST" });
  const session = data.session as { name?: string; key?: string } | undefined;
  if (!session?.name || !session.key) {
    throw new AppError(ErrorCodes.EXTERNAL_SERVICE_FAILED, {
      message: "Last.fm sent an unexpected answer.",
    });
  }

  const profile = {
    realName: null as string | null,
    country: null as string | null,
    imageUrl: null as string | null,
    profileUrl: `https://www.last.fm/user/${encodeURIComponent(session.name)}`,
    playCount: 0,
  };
  try {
    const info = (await call({ method: "user.getInfo", user: session.name, api_key: apiKey }))
      .user as
      | {
          realname?: string;
          country?: string;
          url?: string;
          playcount?: string;
          image?: { "#text": string }[];
        }
      | undefined;
    if (info) {
      profile.realName = info.realname || null;
      profile.country = info.country || null;
      profile.profileUrl = info.url || profile.profileUrl;
      profile.playCount = parseInt(info.playcount ?? "0", 10) || 0;
      profile.imageUrl = info.image?.at(-1)?.["#text"] || null;
    }
  } catch {
    // The profile is a nicety; the session is what matters.
  }
  return { username: session.name, sessionKey: session.key, ...profile };
}

type Scrobble = {
  name?: string;
  organization?: { "#text"?: string; name?: string } | string;
  "@attr"?: { nowplaying?: string };
};

/** Same rule as before: exact name, or at least half the words in common. */
export function artistNamesMatch(a: string, b: string) {
  const na = a.toLowerCase().trim();
  const nb = b.toLowerCase().trim();
  if (na === nb) return true;
  const wordsA = na.split(/\s+/);
  const setB = new Set(nb.split(/\s+/));
  return wordsA.filter((word) => setB.has(word)).length / Math.max(wordsA.length, setB.size) >= 0.5;
}

/** How many times `username` scrobbled this track since `fromSeconds` (now-playing excluded). */
export async function countScrobbles(
  username: string,
  trackName: string,
  artistName: string,
  fromSeconds: number,
) {
  const { apiKey } = lastFmKeys();
  const wanted = trackName.toLowerCase().trim();
  let total = 0;
  for (let page = 1; ; page++) {
    const data = await call({
      method: "user.getRecentTracks",
      user: username,
      from: String(Math.floor(fromSeconds)),
      limit: "200",
      page: String(page),
      api_key: apiKey,
    });
    const recent = data.recenttracks as
      { track?: Scrobble[] | Scrobble; "@attr"?: { totalPages?: string } } | undefined;
    const tracks = Array.isArray(recent?.track) ? recent.track : [];
    if (tracks.length === 0) break;
    for (const track of tracks) {
      if (track["@attr"]?.nowplaying === "true") continue;
      const artist =
        typeof track.organization === "string"
          ? track.organization
          : (track.organization?.["#text"] ?? track.organization?.name ?? "");
      if (track.name?.toLowerCase().trim() === wanted && artistNamesMatch(artist, artistName))
        total++;
    }
    if (page >= parseInt(recent?.["@attr"]?.totalPages ?? "1", 10)) break;
  }
  return total;
}
