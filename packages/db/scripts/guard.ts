/**
 * The one place that decides which databases the db scripts may touch.
 *
 * Rules (production data must never be erased):
 *  - Destructive or bulk-write scripts (seed, reset, the legacy copy) only run against a
 *    LOCAL database, or a host the owner has listed in ALLOW_DESTRUCTIVE_HOSTS.
 *  - Any host listed in PROTECTED_HOSTS is refused even if it is also allowed.
 *  - The legacy (Actionverse) database is only ever opened read-only, and never when it is
 *    the same database as DATABASE_URL.
 * Nothing here has a default that points at a real server: an unset variable means refuse.
 */
export type DbParts = { hostname: string; database: string };

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "host.docker.internal"]);

export function dbParts(url: string): DbParts {
  const { hostname, pathname } = new URL(url);
  return { hostname, database: pathname.replace(/^\//, "") };
}

const list = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

export const isLocalHost = (hostname: string) => LOCAL_HOSTS.has(hostname.toLowerCase());

type Env = Record<string, string | undefined>;

/** Throws unless `url` is a database this script may write to. `what` names the script for the message. */
export function assertWritable(url: string | undefined, what: string, env: Env = process.env) {
  if (!url) throw new Error(`Refusing to ${what}: DATABASE_URL is not set.`);
  const { hostname, database } = dbParts(url);
  const host = hostname.toLowerCase();
  if (list(env.PROTECTED_HOSTS).includes(host))
    throw new Error(`Refusing to ${what} on ${hostname}: it is listed in PROTECTED_HOSTS.`);
  if (isLocalHost(host) || list(env.ALLOW_DESTRUCTIVE_HOSTS).includes(host))
    return { hostname, database };
  throw new Error(
    `Refusing to ${what} on ${hostname}/${database}: only a local database, or a host listed in ` +
      `ALLOW_DESTRUCTIVE_HOSTS, may be written by this script.`,
  );
}

/** The legacy database must be set, and must not be the database being written. */
export function assertLegacySource(legacyUrl: string | undefined, targetUrl: string | undefined) {
  if (!legacyUrl)
    throw new Error("Set LEGACY_DATABASE_URL (the Actionverse database, opened read only).");
  const legacy = dbParts(legacyUrl);
  if (targetUrl) {
    const target = dbParts(targetUrl);
    if (legacy.hostname === target.hostname && legacy.database === target.database)
      throw new Error("DATABASE_URL (new) and LEGACY_DATABASE_URL are the same database.");
  }
  return legacy;
}
