import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Prisma 7 reads the connection URL here. The schema is a folder: one .prisma
 * file per domain (identity, artist, catalog, market, …).
 *
 * `prisma generate` needs no database, so a missing DATABASE_URL must not stop
 * `pnpm install`; commands that connect fail on the placeholder instead.
 */
const NO_DATABASE = "postgresql://not-configured:not-configured@localhost:5432/not-configured";

export default defineConfig({
  schema: "prisma/schema",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env.DATABASE_URL ?? NO_DATABASE },
});
