#!/usr/bin/env node
/**
 * Pushes an env file to a Vercel project, without ever printing a value.
 *
 *   node scripts/vercel/push-env.mjs \
 *     --project actiontokens-ar-dev --scope actions-projects-1ed41ec1 \
 *     --from apps/ar/.env.development.local --targets preview,production \
 *     --set NEXTAUTH_URL=https://actiontokens-ar-dev.vercel.app \
 *     --from-env DATABASE_URL=VERCEL_DATABASE_URL
 *
 *   --set KEY=VALUE        override or add a non-secret value (URLs and the like)
 *   --from-env KEY=ENVVAR  take KEY's value from this shell's environment (for secrets you do not
 *                          want in a file or in shell history: export it, then pass the name)
 *   --skip KEY             do not push this key (repeatable)
 *   --plain                store everything as plain config. Needed for the development target, where
 *                          Vercel does not allow Sensitive values (they will be readable in the dashboard)
 *   --dry-run              show what would be pushed (names and kinds only)
 *
 * Secret-looking keys (SECRET, KEY, TOKEN, PASSWORD, PRIVATE, DATABASE_URL) are stored as Sensitive:
 * Vercel will not show them again. NEXT_PUBLIC_* values are public by design and stored as plain config.
 * Empty values are skipped. Values go to the CLI on stdin, never on the command line.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const argv = process.argv.slice(2);
const opts = {
  project: "",
  scope: "",
  from: "",
  targets: "preview,production",
  set: [],
  fromEnv: [],
  skip: [],
  plain: false,
  dry: false,
};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  const next = () => argv[++i] ?? "";
  if (a === "--project") opts.project = next();
  else if (a === "--scope") opts.scope = next();
  else if (a === "--from") opts.from = next();
  else if (a === "--targets") opts.targets = next();
  else if (a === "--set") opts.set.push(next());
  else if (a === "--from-env") opts.fromEnv.push(next());
  else if (a === "--skip") opts.skip.push(next());
  else if (a === "--plain") opts.plain = true;
  else if (a === "--dry-run") opts.dry = true;
  else {
    console.error(`Unknown option ${a}`);
    process.exit(2);
  }
}
if (!opts.project || !opts.from) {
  console.error("Need --project and --from. See the header of this file.");
  process.exit(2);
}

/** Minimal dotenv reader: KEY=value, optional quotes, # comments. Multi-line values stay in quotes. */
function parseEnv(text) {
  const out = new Map();
  const re = /^\s*([A-Z0-9_]+)\s*=\s*("([\s\S]*?)"|'([\s\S]*?)'|([^\n#]*))/gm;
  let m;
  while ((m = re.exec(text))) {
    const raw = m[3] ?? m[4] ?? (m[5] ?? "").trim();
    out.set(m[1], raw.replace(/\\n/g, "\n"));
  }
  return out;
}

const values = parseEnv(readFileSync(opts.from, "utf8"));
for (const pair of opts.set) {
  const eq = pair.indexOf("=");
  values.set(pair.slice(0, eq), pair.slice(eq + 1));
}
for (const pair of opts.fromEnv) {
  const [key, name] = pair.split("=");
  const v = process.env[name ?? key];
  if (!v) {
    console.error(`--from-env ${key}: environment variable ${name ?? key} is not set.`);
    process.exit(2);
  }
  values.set(key, v);
}
for (const key of opts.skip) values.delete(key);

const isSecret = (key) =>
  !opts.plain &&
  !key.startsWith("NEXT_PUBLIC_") &&
  /(SECRET|KEY|TOKEN|PASSWORD|PRIVATE|DATABASE_URL|CREDENTIALS)/.test(key);

let pushed = 0;
let skipped = 0;
for (const [key, value] of values) {
  if (!value) {
    skipped++;
    console.log(`  skip   ${key} (empty)`);
    continue;
  }
  const kind = isSecret(key) ? "sensitive" : "config";
  if (opts.dry) {
    console.log(`  would  ${key} [${kind}] -> ${opts.targets}`);
    continue;
  }
  const args = [
    "env",
    "add",
    key,
    "--environment",
    opts.targets,
    "--project",
    opts.project,
    "--force",
    "--yes",
    isSecret(key) ? "--sensitive" : "--no-sensitive",
  ];
  if (opts.scope) args.push("--scope", opts.scope);
  const r = spawnSync("vercel", args, { input: value, encoding: "utf8" });
  if (r.status !== 0) {
    console.error(
      `  FAILED ${key}: ${(r.stderr || r.stdout || "").trim().split("\n").slice(-2).join(" ").replace(value, "<value>")}`,
    );
    process.exitCode = 1;
  } else {
    pushed++;
    console.log(`  ok     ${key} [${kind}]`);
  }
}
console.log(opts.dry ? "Dry run only." : `Done: ${pushed} pushed, ${skipped} skipped.`);
