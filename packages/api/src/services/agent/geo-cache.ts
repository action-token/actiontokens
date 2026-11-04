import { createHash } from "node:crypto";

import type { Context } from "../../context";

/**
 * A database cache for Google lookups, so repeating a search costs no API
 * calls. Places and geocodes are public data, never anything artist-specific.
 */
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
type Entry<T> = { value: T; cachedAt: number };
type Db = Pick<Context, "db">["db"];

let store: Db | null = null;
/** The worker sets the database once; lookups made without one just aren't cached. */
export const useGeoCache = (db: Db | null) => {
  store = db;
};

/** A readable key plus a hash of the exact text, so names that differ only in dropped characters never share an entry. */
export function cacheKey(...parts: (string | number)[]): string {
  const text = parts.map((p) => String(p).toLowerCase().trim().replace(/\s+/g, " ")).join(":");
  const readable = text
    .replace(/ /g, "_")
    .replace(/[^a-z0-9_.,:-]/g, "")
    .slice(0, 150);
  return `${readable}#${createHash("sha256").update(text).digest("hex").slice(0, 16)}`;
}

export async function cached<T>(
  key: string,
  load: () => Promise<T | null>,
  ttlMs = MONTH_MS,
): Promise<T | null> {
  if (store) {
    try {
      const row = await store.geoCache.findUnique({ where: { key } });
      if (row) {
        const entry = JSON.parse(row.value) as Entry<T>;
        if (typeof entry.cachedAt === "number" && Date.now() - entry.cachedAt < ttlMs)
          return entry.value;
      }
    } catch {
      // Unreadable entry: reload below.
    }
  }
  const value = await load();
  if (value !== null && store) {
    const json = JSON.stringify({ value, cachedAt: Date.now() } satisfies Entry<T>);
    await store.geoCache
      .upsert({ where: { key }, create: { key, value: json }, update: { value: json } })
      .catch((error: unknown) => console.warn("[geo-cache] write failed", error));
  }
  return value;
}
