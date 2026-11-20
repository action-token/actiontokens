/**
 * Copies the old layout (read only, from the backup) into the new schema, in
 * one transaction: any problem leaves the target untouched.
 *
 *   LEGACY_SOURCE_URL=… LEGACY_TARGET_URL=… pnpm --filter @bandcoin/db legacy:copy
 *
 * Without --cutover it rehearses in the backup database's `rehearsal` schema,
 * with a throwaway key that's never saved. With --cutover it also needs
 * CHAIN_ACCOUNT_KEY and CUTOVER_CONFIRM=ep-soft-term. Nothing here signs or
 * sends a Stellar transaction, and no secret is ever printed.
 */
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import pg from "pg";

import { Copier } from "./copier";
import { copyAssets, copyFanTokens, copyMarket, copyNfts } from "./steps-catalog";
import { copyAgent, copyBounties } from "./steps-bounty";
import { copyArtistExtras, copyArtists, copyUsers } from "./steps-people";
import { copyPins } from "./steps-ar";
import { copyNotifications, copyPosts } from "./steps-social";
import { checkTargets, MUST_BE_EMPTY } from "./targets";
import { accountsOnMainnet, verify } from "./verify";

const cutover = process.argv.includes("--cutover");
const target = checkTargets({
  sourceUrl: process.env.LEGACY_SOURCE_URL,
  targetUrl: process.env.LEGACY_TARGET_URL,
  cutover,
});
if (cutover && process.env.CUTOVER_CONFIRM !== "ep-soft-term")
  throw new Error("Set CUTOVER_CONFIRM=ep-soft-term to write to the main database.");
const chainKey = cutover ? process.env.CHAIN_ACCOUNT_KEY : randomBytes(32).toString("hex");
if (!chainKey || !/^[0-9a-f]{64}$/i.test(chainKey))
  throw new Error("CHAIN_ACCOUNT_KEY must be 64 hex characters.");

const source = new pg.Client({ connectionString: process.env.LEGACY_SOURCE_URL });
const dest = new pg.Client({ connectionString: process.env.LEGACY_TARGET_URL });
await source.connect();
await dest.connect();
await source.query("SET default_transaction_read_only = on");
await dest.query(`SET search_path TO "${target.schema}"`);

try {
  for (const table of MUST_BE_EMPTY) {
    const rows = Number((await source.query(`SELECT count(*) n FROM "${table}"`)).rows[0].n);
    if (rows > 0)
      throw new Error(`${table} now has ${rows} rows and this tool has no rule for it.`);
  }
  const existing = Number((await dest.query(`SELECT count(*) n FROM users`)).rows[0].n);
  if (existing > 0) throw new Error(`The target already has ${existing} users: refusing to mix.`);

  const copy = new Copier(source, dest, chainKey);
  await dest.query("BEGIN");
  const started = Date.now();
  for (const [name, step] of [
    ["users", copyUsers],
    ["artists and keys", copyArtists],
    ["tiers, follows, pages", copyArtistExtras],
    ["fan tokens", copyFanTokens],
    ["items", copyAssets],
    ["NFTs, listings, orders", copyNfts],
    ["market", copyMarket],
    ["posts", copyPosts],
    ["notifications", copyNotifications],
    ["pins", copyPins],
    ["bounties", copyBounties],
    ["agent", copyAgent],
  ] as const) {
    await step(copy);
    console.log(`copied ${name}`);
  }
  await copy.saveIdMap();
  const result = await verify(copy);
  await dest.query("COMMIT");

  const keys = (await dest.query(`SELECT "publicKey" FROM chain_accounts`)).rows.map(
    (row: { publicKey: string }) => row.publicKey,
  );
  const mainnet = await accountsOnMainnet(keys);

  const reasons = new Map<string, number>();
  for (const row of copy.skipped) {
    const key = `${row.table}: ${row.why}`;
    reasons.set(key, (reasons.get(key) ?? 0) + 1);
  }
  const report = [
    `# Data copy report (${cutover ? "CUTOVER" : "rehearsal"})`,
    "",
    `Generated ${new Date().toISOString()}. Took ${Math.round((Date.now() - started) / 1000)} s. Target schema: \`${target.schema}\`.`,
    "",
    "## Checks",
    "",
    `- Every count below adds up (old rows = new rows + rows skipped for a stated reason).`,
    `- ${result.keysChecked} stored keys open correctly and match their public keys.`,
    `- ${mainnet.found} of ${keys.length} stored accounts exist on mainnet (read only).${mainnet.missing.length ? ` Not found: ${mainnet.missing.join(", ")}.` : ""}`,
    `- ${result.facts.admins} admins, ${result.facts.walletless} users without a wallet.`,
    `- No unfinished orders or jobs carried over, so the new worker has nothing to act on.`,
    "",
    "## Left out, and why",
    "",
    ...(reasons.size === 0
      ? ["Nothing."]
      : [...reasons.entries()].map(([key, n]) => `- ${n} × ${key}`)),
    "",
    "## Counts",
    "",
    "| Old | Rows | New | Rows | Skipped |",
    "|---|---:|---|---:|---:|",
    ...result.lines.map(
      (l) => `| ${l.old} | ${l.oldRows} | ${l.next} | ${l.newRows} | ${l.skipped} |`,
    ),
    "",
  ].join("\n");
  const path = resolve(import.meta.dirname, "../../../../docs/migration-report.md");
  writeFileSync(path, report);
  console.log(`Done. Report: ${path}`);
} catch (error) {
  await dest.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  await source.end();
  await dest.end();
}
