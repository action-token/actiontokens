/**
 * One-time copy of the old Actionverse database into the new schema.
 *
 *   pnpm --filter @actiontokens/db legacy:dry-run [--label=prod]   reads only; writes docs/migration-report[-label].md
 *   pnpm --filter @actiontokens/db legacy:run       (after approval) copies the data
 *
 * The legacy database is opened read-only (LEGACY_DATABASE_URL), never written.
 */
import "dotenv/config";

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { CHECKS, type TableCheck } from "./checks";
import { connectLegacyReadOnly, count } from "./legacy-db";

type CheckResult = TableCheck & {
  rows: number | null;
  issueCounts: { label: string; action: string; n: number }[];
  breakdownRows: { k: string; n: string }[];
  /** Checks that couldn't run on this database (usually a column the old schema doesn't have) */
  errors: { what: string; message: string }[];
};

const messageOf = (error: unknown) =>
  (error instanceof Error ? error.message : String(error)).replace(/postgres\S+/g, "<url>");

async function runDryRun() {
  const legacy = await connectLegacyReadOnly();
  const results: CheckResult[] = [];
  try {
    const { rows: tables } = await legacy.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
    );
    const existing = new Set(tables.map((r) => r.table_name));

    for (const check of CHECKS) {
      if (!existing.has(check.oldTable)) {
        results.push({ ...check, rows: null, issueCounts: [], breakdownRows: [], errors: [] });
        continue;
      }
      const errors: CheckResult["errors"] = [];
      let rows: number | null = null;
      try {
        rows = await count(legacy, `SELECT count(*) AS n FROM "${check.oldTable}"`);
      } catch (error) {
        errors.push({ what: "row count", message: messageOf(error) });
      }
      const issueCounts: CheckResult["issueCounts"] = [];
      for (const issue of check.issues ?? []) {
        try {
          issueCounts.push({
            label: issue.label,
            action: issue.action,
            n: await count(legacy, issue.sql),
          });
        } catch (error) {
          errors.push({ what: issue.label, message: messageOf(error) });
        }
      }
      let breakdownRows: CheckResult["breakdownRows"] = [];
      if (check.breakdown) {
        try {
          breakdownRows = (await legacy.query<{ k: string; n: string }>(check.breakdown.sql)).rows;
        } catch (error) {
          errors.push({ what: check.breakdown.label, message: messageOf(error) });
        }
      }
      results.push({ ...check, rows, issueCounts, breakdownRows, errors });
      process.stdout.write(".");
    }

    const unmapped = [...existing].filter(
      (name) => !CHECKS.some((c) => c.oldTable === name) && !name.startsWith("_prisma"),
    );
    const label = process.argv.find((a) => a.startsWith("--label="))?.slice(8);
    const reportPath = resolve(
      import.meta.dirname,
      `../../../../docs/migration-report${label ? `-${label}` : ""}.md`,
    );
    writeFileSync(reportPath, renderReport(results, unmapped));
    console.log(`\nWrote ${reportPath}`);
  } finally {
    await legacy.end();
  }
}

function renderReport(results: CheckResult[], unmapped: string[]): string {
  const lines: string[] = [];
  const total = results.reduce((sum, r) => sum + (r.rows ?? 0), 0);
  lines.push("# Legacy migration: dry-run report", "");
  lines.push(
    `Generated ${new Date().toISOString()} from the old Actionverse database (read only). Nothing was written.`,
    "",
  );
  lines.push(
    `**${total.toLocaleString("en-US")} rows** in ${results.filter((r) => r.rows !== null).length} old tables.`,
    "",
  );

  const flagged = results.flatMap((r) =>
    r.issueCounts.filter((i) => i.n > 0).map((i) => ({ table: r.oldTable, ...i })),
  );
  lines.push("## Rows that need attention", "");
  if (flagged.length === 0) lines.push("None.", "");
  else {
    lines.push("| Old table | What | Rows | What the migration does |", "|---|---|---:|---|");
    for (const f of flagged)
      lines.push(`| ${f.table} | ${f.label} | ${f.n.toLocaleString("en-US")} | ${f.action} |`);
    lines.push("");
  }

  let domain = "";
  lines.push("## Every table", "");
  for (const r of results) {
    if (r.domain !== domain) {
      domain = r.domain;
      lines.push(
        `### ${domain}`,
        "",
        "| Old table | Rows | New table | Note |",
        "|---|---:|---|---|",
      );
    }
    const rows = r.rows === null ? "(missing)" : r.rows.toLocaleString("en-US");
    lines.push(`| ${r.oldTable} | ${rows} | ${r.newTable} | ${r.note ?? ""} |`);
    if (r.breakdownRows.length > 0) {
      const parts = r.breakdownRows
        .map((b) => `${b.k}: ${Number(b.n).toLocaleString("en-US")}`)
        .join(", ");
      lines.push(`| ↳ ${r.breakdown?.label} | | ${parts} | |`);
    }
    const next = results[results.indexOf(r) + 1];
    if (!next || next.domain !== domain) lines.push("");
  }

  const failed = results.flatMap((r) => r.errors.map((e) => ({ table: r.oldTable, ...e })));
  if (failed.length > 0) {
    lines.push(
      "## Checks that couldn't run on this database",
      "",
      "| Old table | Check | Database said |",
      "|---|---|---|",
      ...failed.map((f) => `| ${f.table} | ${f.what} | ${f.message.replace(/\|/g, "/")} |`),
      "",
    );
  }

  if (unmapped.length > 0) {
    lines.push(
      "## Old tables the plan doesn't cover",
      "",
      unmapped.map((u) => `- ${u}`).join("\n"),
      "",
    );
  }
  return lines.join("\n");
}

const isDryRun = process.argv.includes("--dry-run");
if (!isDryRun) {
  console.error("Only --dry-run is available until the schema and this report are approved.");
  process.exit(1);
}
await runDryRun();
