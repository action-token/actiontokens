import pg from "pg";

/** The only legacy database this script may open: bandfan's dev DB. */
const ALLOWED_LEGACY = { hostPrefix: "ep-icy-wildflower-", database: "old-bandcoin" };

/**
 * Opens the old bandfan database READ ONLY. Refuses anything but the dev
 * database, so production can never be touched by mistake.
 */
export async function connectLegacyReadOnly(): Promise<pg.Client> {
  const url = process.env.LEGACY_DATABASE_URL;
  if (!url) throw new Error("Set LEGACY_DATABASE_URL in packages/db/.env (the old bandfan dev database).");

  const { hostname, pathname } = new URL(url);
  const database = pathname.replace(/^\//, "");
  if (!hostname.startsWith(ALLOWED_LEGACY.hostPrefix) || database !== ALLOWED_LEGACY.database) {
    throw new Error(`Refusing to open ${hostname}/${database}: only the old dev database is allowed.`);
  }
  if (process.env.DATABASE_URL && new URL(process.env.DATABASE_URL).hostname === hostname) {
    throw new Error("DATABASE_URL (new) and LEGACY_DATABASE_URL point at the same host.");
  }

  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 30_000 });
  await client.connect();
  await client.query("SET default_transaction_read_only = on");
  return client;
}

/** Runs a query that returns one number. */
export async function count(client: pg.Client, sql: string): Promise<number> {
  const { rows } = await client.query<{ n: string | number }>(sql);
  return Number(rows[0]?.n ?? 0);
}
