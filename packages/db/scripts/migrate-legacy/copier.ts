import type pg from "pg";

import { json, newId } from "./map";

export type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const BATCH = 500;

/**
 * What every copy step uses: read from the old layout, write to the new one
 * (all in one transaction), and remember how old ids became new ones and which
 * rows were left out and why. Secrets never go through the report.
 */
export class Copier {
  readonly inserted: Record<string, number> = {};
  readonly skipped: { table: string; id: string; why: string }[] = [];
  readonly notes: string[] = [];
  readonly slugs = new Map<string, Set<string>>();
  private ids = new Map<string, string>();

  constructor(
    readonly source: pg.Client,
    readonly target: pg.Client,
    readonly chainKey: string,
  ) {}

  /** Rows of an old table, or of a query. */
  async read(tableOrSql: string): Promise<Row[]> {
    const sql = tableOrSql.includes(" ") ? tableOrSql : `SELECT * FROM "${tableOrSql}"`;
    return (await this.source.query(sql)).rows;
  }

  async insert(table: string, rows: Row[]) {
    this.inserted[table] = (this.inserted[table] ?? 0) + rows.length;
    for (let at = 0; at < rows.length; at += BATCH) {
      const batch = rows.slice(at, at + BATCH);
      const columns = Object.keys(batch[0]!);
      const values: unknown[] = [];
      const lines = batch.map((row) => {
        const slots = columns.map((column) => {
          values.push(row[column] === undefined ? null : row[column]);
          return `$${values.length}`;
        });
        return `(${slots.join(",")})`;
      });
      const names = columns.map((column) => `"${column}"`).join(",");
      await this.target.query(
        `INSERT INTO "${table}" (${names}) VALUES ${lines.join(",")}`,
        values,
      );
    }
  }

  /** Gives an old id a new id (or keeps it) and remembers the pairing. */
  map(oldTable: string, oldId: unknown, keep = false) {
    const id = keep ? String(oldId) : newId();
    this.ids.set(`${oldTable}:${String(oldId)}`, id);
    return id;
  }

  /** The new id, or null when the old row wasn't copied. */
  find(oldTable: string, oldId: unknown) {
    if (oldId === null || oldId === undefined) return null;
    return this.ids.get(`${oldTable}:${String(oldId)}`) ?? null;
  }

  /** The new id of a row that has to exist: stops the whole copy if it doesn't. */
  must(oldTable: string, oldId: unknown) {
    const id = this.find(oldTable, oldId);
    if (!id) throw new Error(`${oldTable} ${String(oldId)} is referenced but wasn't copied.`);
    return id;
  }

  skip(table: string, id: unknown, why: string) {
    this.skipped.push({ table, id: String(id), why });
  }

  slug(scope: string) {
    let taken = this.slugs.get(scope);
    if (!taken) this.slugs.set(scope, (taken = new Set()));
    return taken;
  }

  /** Writes the id pairs, so old links can still be resolved later. */
  async saveIdMap() {
    const rows = [...this.ids.entries()].map(([key, newIdValue]) => {
      const split = key.indexOf(":");
      return {
        legacyTable: key.slice(0, split),
        legacyId: key.slice(split + 1),
        newId: newIdValue,
      };
    });
    await this.insert("legacy_id_map", rows);
  }
}

export { json };
