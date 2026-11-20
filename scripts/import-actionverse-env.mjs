#!/usr/bin/env node
/**
 * Builds ActionTokens env files from the Actionverse ones (.env.development, .env.production).
 *
 *   node scripts/import-actionverse-env.mjs /Volumes/Data/Projects/actionverse [/Volumes/Data/Projects/bandcoin]
 *
 * The optional second path is the Bandcoin repo: ActionTokens shares Bandcoin's NFT and escrow
 * contracts (owner decision 2026-11-20), so NFT_CONTRACT and ESCROW_CONTRACT are copied from
 * Bandcoin's apps/app/.env.local (development, testnet) and .env.production (production,
 * mainnet). They fill only what Actionverse doesn't have.
 *
 * Values are copied straight from file to file and NEVER printed. Only variables an app lists
 * in its .env.example are written to it. Written (all gitignored):
 *   apps/{app,org,ar}/.env.development.local   from Actionverse .env.development (testnet)
 *   apps/{app,org,ar}/.env.production.local    from Actionverse .env.production  (mainnet)
 *   apps/worker/.env.local / .env.production.local
 *   packages/db/.env
 *   .env.development and .env.production at the repo root: every variable any app expects
 *   (union of the apps' .env.example files), copied from Actionverse; anything Actionverse
 *   doesn't have is written EMPTY.
 * Safety: the Actionverse DATABASE_URLs go ONLY into LEGACY_*_DATABASE_URL (read only) and into
 * PROTECTED_HOSTS. DATABASE_URL is the local Docker database in development and empty in
 * production until the new production database exists. An existing CHAIN_ACCOUNT_KEY is kept.
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(new URL("../packages/db/package.json", import.meta.url));
const { parse } = require("dotenv");
const stellar = createRequire(new URL("../packages/chain/package.json", import.meta.url))(
  "@stellar/stellar-sdk",
);

const sourceDir = process.argv[2];
if (!sourceDir) throw new Error("Usage: import-actionverse-env.mjs <path to the actionverse repo>");
const root = resolve(new URL("..", import.meta.url).pathname);
const LOCAL_DB = "postgresql://actiontokens:actiontokens@127.0.0.1:55432/actiontokens_dev";
// Production for now: a separate database in the same Docker Postgres (owner decision 2026-11-20).
const PROD_DB = "postgresql://actiontokens:actiontokens@127.0.0.1:55432/actiontokens_prod";
const PORTS = { app: 3000, org: 3001, ar: 3002 };

const bandcoinDir = process.argv[3];
const SHARED_CONTRACTS = ["NFT_CONTRACT", "ESCROW_CONTRACT"];
const readShared = (file) => {
  const path = bandcoinDir && resolve(bandcoinDir, "apps/app", file);
  if (!path || !existsSync(path)) return {};
  const all = parse(readFileSync(path));
  return Object.fromEntries(SHARED_CONTRACTS.filter((k) => all[k]).map((k) => [k, all[k]]));
};

const read = (name) => parse(readFileSync(resolve(sourceDir, name)));
const quote = (v) => (/^[A-Za-z0-9_./:@,+=-]*$/.test(v) ? v : JSON.stringify(v));
const names = (file) =>
  existsSync(file)
    ? new Set([...readFileSync(file, "utf8").matchAll(/^[#\s]*([A-Z][A-Z0-9_]+)=/gm)].map((m) => m[1]))
    : new Set();
const hostOf = (url) => (url ? new URL(url).hostname : "");


/** Sections, in the order they appear in every env file. The first matching pattern wins. */
const SECTIONS = [
  ["Database", /^(DATABASE_|LEGACY_|PROTECTED_HOSTS|ALLOW_DESTRUCTIVE_HOSTS|CUTOVER_)/],
  ["App", /^(NEXT_PUBLIC_(SITE|TITLE|DESC|ICON|STAGE|URL|APP_URL|ORG_URL|AR_URL)|NEXTAUTH_URL|ORG_APP_ORIGINS|DOMAIN_HOST|AUTH_COOKIE_DOMAIN|PORT)$/],
  ["Auth (NextAuth, Firebase)", /^(NEXTAUTH_SECRET|NEXT_PUBLIC_AUTH_|FIREBASE_)/],
  ["Stellar and contracts", /^(NEXT_PUBLIC_(STELLAR|ASSET|USDC)|CHAIN_ACCOUNT_KEY|PLATFORM_TREASURY|TREASURY_SECRET|MOTHER_SECRET|RUBY_ACCOUNTS_SECRET|STORAGE_SECRET|NFT_CONTRACT|ESCROW_CONTRACT|HORIZON_URL|SOROBAN_RPC_URL|STELLAR_BASE_FEE)/],
  ["File storage (S3)", /^(NEXT_)?AWS_/],
  ["Email", /^(SMTP_|MAIL_FROM)/],
  ["Payments (Square)", /SQUARE_/],
  ["Maps", /(MAPBOX|GOOGLE_MAP|GOOGLE_CLOUD|GOOGLE_VISION)/],
  ["Music (Last.fm)", /^LASTFM_/],
  ["AI (OpenAI)", /^OPENAI_/],
  ["Facebook", /FACEBOOK_|SOCIAL_TOKEN/],
  ["Custom domains (Vercel)", /^VERCEL_/],
  ["Worker", /^(WORKER_|JOB_TIMEOUT|FFMPEG_|FFPROBE_)/],
];
const sectionOf = (name) => SECTIONS.find(([, re]) => re.test(name))?.[0] ?? "Other";

/** Env text: a header, then each section with a rule line, its variables A to Z, one blank line between. */
function render(header, values) {
  const groups = new Map([...SECTIONS.map(([t]) => [t, []]), ["Other", []]]);
  for (const name of [...values.keys()].sort()) groups.get(sectionOf(name)).push(name);
  const out = [...header.map((l) => (l ? `# ${l}` : "#")), ""];
  for (const [title, list] of groups) {
    if (!list.length) continue;
    out.push(`# ${"─".repeat(3)} ${title} ${"─".repeat(Math.max(3, 68 - title.length))}`);
    for (const name of list) out.push(`${name}=${quote(String(values.get(name) ?? ""))}`);
    out.push("");
  }
  return out.join("\n");
}

function existingKey(file) {
  if (!existsSync(file)) return null;
  const v = parse(readFileSync(file))["CHAIN_ACCOUNT_KEY"];
  return v && /^[0-9a-f]{64}$/i.test(v) ? v : null;
}

/** ActionTokens variable values, derived from one Actionverse env. */
function derive(src, kind, app, chainKey) {
  const dev = kind === "development";
  const out = {
    NEXT_PUBLIC_STELLAR_NETWORK: String(src.NEXT_PUBLIC_STELLAR_PUBNET) === "true" ? "mainnet" : "testnet",
    SMTP_HOST: "smtp.gmail.com",
    SMTP_PORT: "465",
    SMTP_USER: src.NEXT_PUBLIC_NODEMAILER_USER,
    SMTP_PASS: src.NEXT_PUBLIC_NODEMAILER_PASS,
    MAIL_FROM: src.NEXT_PUBLIC_NODEMAILER_USER,
    LASTFM_API_KEY: src.NEXT_PUBLIC_LASTFM_API_KEY,
    LASTFM_SHARED_SECRET: src.NEXT_PUBLIC_LASTFM_API_SECRET,
    GOOGLE_MAP_API_KEY: src.NEXT_PUBLIC_GOOGLE_MAP_API_KEY,
    AWS_ACCESS_KEY: src.NEXT_AWS_ACCESS_KEY,
    AWS_SECRET_ACCESS_KEY: src.NEXT_AWS_SECRET_ACCESS_KEY,
    AWS_BUCKET_NAME: src.NEXT_AWS_BUCKET_NAME,
    AWS_BUCKET_REGION: src.NEXT_AWS_BUCKET_REGION,
    DATABASE_URL: dev ? LOCAL_DB : PROD_DB,
    CHAIN_ACCOUNT_KEY: dev ? chainKey : "",
  };
  if (src.TREASURY_SECRET) out.PLATFORM_TREASURY = stellar.Keypair.fromSecret(src.TREASURY_SECRET).publicKey();
  if (dev && PORTS[app]) {
    out.NEXTAUTH_URL = `http://localhost:${PORTS[app]}`;
    out.NEXT_PUBLIC_URL = `http://localhost:${PORTS[app]}`;
    out.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    out.NEXT_PUBLIC_ORG_URL = "http://localhost:3001";
    out.NEXT_PUBLIC_AR_URL = "http://localhost:3002";
    out.ORG_APP_ORIGINS = "http://localhost:3001";
  }
  return out;
}

function write(file, wanted, src, derived, header) {
  const values = new Map();
  for (const name of wanted) {
    const value = derived[name] ?? src[name];
    if (value !== undefined && value !== null) values.set(name, value);
  }
  writeFileSync(file, render(header, values), { mode: 0o600 });
  console.log(`wrote ${file.replace(root + "/", "")} (${values.size} variables)`);
}

const dev = { ...readShared(".env.local"), ...read(".env.development") };
const prod = { ...readShared(".env.production"), ...read(".env.production") };
// The real Actionverse databases may differ from the ones in its env files; packages/db/.env.legacy
// (gitignored) wins. Every host seen anywhere stays protected.
const seenHosts = new Set([hostOf(dev.DATABASE_URL), hostOf(prod.DATABASE_URL)].filter(Boolean));
const legacyFile = resolve(root, "packages/db/.env.legacy");
if (existsSync(legacyFile)) {
  const o = parse(readFileSync(legacyFile));
  if (o.ACTIONVERSE_DEV_DATABASE_URL) dev.DATABASE_URL = o.ACTIONVERSE_DEV_DATABASE_URL;
  if (o.ACTIONVERSE_PROD_DATABASE_URL) prod.DATABASE_URL = o.ACTIONVERSE_PROD_DATABASE_URL;
  console.log("using the Actionverse database URLs from packages/db/.env.legacy");
}
for (const u of [dev.DATABASE_URL, prod.DATABASE_URL]) if (u) seenHosts.add(hostOf(u));
const protectedList = [...seenHosts].join(",");
const chainKey =
  existingKey(resolve(root, "packages/db/.env")) ?? randomBytes(32).toString("hex");

for (const app of ["app", "org", "ar", "worker"]) {
  const wanted = names(resolve(root, `apps/${app}/.env.example`));
  const dir = resolve(root, `apps/${app}`);
  const note = (kind) => [
    `ActionTokens ${app} · ${kind}`,
    `Generated by scripts/import-actionverse-env.mjs from Actionverse .env.${kind}. Do not commit.`,
    kind === "production"
      ? "DATABASE_URL is the Docker Postgres database actiontokens_prod; the app URLs are empty until the domains exist."
      : "DATABASE_URL is the local Docker database (pnpm db:up).",
  ];
  const devFile = app === "worker" ? ".env.local" : ".env.development.local";
  write(resolve(dir, devFile), wanted, dev, derive(dev, "development", app, chainKey), note("development"));
  write(resolve(dir, ".env.production.local"), wanted, prod, derive(prod, "production", app, ""), note("production"));
}

// Root .env.development / .env.production: the full set, missing values empty.
const allNames = new Set(["LEGACY_DATABASE_URL", "PROTECTED_HOSTS"]);
for (const app of ["app", "org", "ar", "worker"])
  for (const n of names(resolve(root, `apps/${app}/.env.example`))) allNames.add(n);
for (const kind of ["development", "production"]) {
  const src = kind === "development" ? dev : prod;
  const derived = derive(src, kind, "app", kind === "development" ? chainKey : "");
  derived.LEGACY_DATABASE_URL = src.DATABASE_URL ?? "";
  derived.PROTECTED_HOSTS = protectedList;
  const values = new Map();
  for (const name of allNames) values.set(name, derived[name] ?? src[name] ?? "");
  const empty = [...values].filter(([, v]) => v === "").length;
  writeFileSync(
    resolve(root, `.env.${kind}`),
    render(
      [
        `ActionTokens · ${kind} (all apps)`,
        `Generated by scripts/import-actionverse-env.mjs from Actionverse .env.${kind}. Do not commit.`,
        "Variables Actionverse does not have are left empty.",
        "DATABASE_URL is the NEW database (Docker Postgres: actiontokens_dev, and actiontokens_prod for production).",
        "The Actionverse database is only LEGACY_DATABASE_URL (read only), and its host is in PROTECTED_HOSTS.",
      ],
      values,
    ),
    { mode: 0o600 },
  );
  console.log(`wrote .env.${kind}: ${values.size - empty} filled, ${empty} empty`);
}

// packages/db/.env: the new local DB, plus the legacy sources (read only) and the protected hosts.
const protectedHosts = protectedList;
writeFileSync(
  resolve(root, "packages/db/.env"),
  render(
    [
      "ActionTokens database scripts",
      "Generated by scripts/import-actionverse-env.mjs. Do not commit.",
      "The Actionverse databases are only ever READ (read-only session, see packages/db/scripts/guard.ts).",
      "The dry run uses the development one; point LEGACY_DATABASE_URL at the production one only for the final copy.",
    ],
    new Map([
      ["DATABASE_URL", LOCAL_DB],
      ["LEGACY_DATABASE_URL", dev.DATABASE_URL ?? ""],
      ["LEGACY_DEV_DATABASE_URL", dev.DATABASE_URL ?? ""],
      ["LEGACY_PROD_DATABASE_URL", prod.DATABASE_URL ?? ""],
      ["PROTECTED_HOSTS", protectedHosts],
      ["CHAIN_ACCOUNT_KEY", chainKey],
    ]),
  ),
  { mode: 0o600 },
);
console.log("wrote packages/db/.env (protected hosts:", protectedHosts.split(",").length + ")");
