import pg from "pg";

import { assertLegacySource } from "../guard";

/**
 * Opens the old Actionverse database READ ONLY (the session is set to
 * default_transaction_read_only, so any write is rejected by Postgres). Refuses to open it
 * when it is the same database as DATABASE_URL.
 */
export async function connectLegacyReadOnly(): Promise<pg.Client> {
  const url = process.env.LEGACY_DATABASE_URL;
  assertLegacySource(url, process.env.DATABASE_URL);

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
