/**
 * Gives real artists on PRODUCTION a designed page, but only where they have none.
 *
 *   PROD_DATABASE_URL=... pnpm --filter @bandcoin/db exec tsx scripts/seed/prod-layouts.ts          (dry run)
 *   PROD_DATABASE_URL=... pnpm --filter @bandcoin/db exec tsx scripts/seed/prod-layouts.ts --apply  (writes)
 *
 * What it will and will not do:
 *   - Dry run unless --apply. It prints, per artist, exactly what it would do.
 *   - Never touches an artist who already has a published page, or a draft with blocks in
 *     it. Those are the artist's own work (3 Years Hollow has one: they can copy the new
 *     design from the dev database through the page editor instead).
 *   - Writes only a page layout (page_layouts). No bio, picture, link, item, price or
 *     account is created, changed or deleted.
 *   - The page only shows what an artist has: blocks with nothing in them stay hidden from
 *     fans until the artist adds something, so nothing is invented.
 *   - Runs in one transaction; any failure writes nothing.
 */
import "dotenv/config";

import pg from "pg";

import { DESIGN, ownContent } from "./artist-designs";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function main() {
  const url = process.env.PROD_DATABASE_URL;
  if (!url) throw new Error("Set PROD_DATABASE_URL.");
  const apply = process.argv.includes("--apply");
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 30_000 });
  await client.connect();
  try {
    await client.query("BEGIN");
    if (!apply) await client.query("SET TRANSACTION READ ONLY");
    const written: string[] = [];
    for (const [slug, design] of Object.entries(DESIGN)) {
      const { rows: artists } = await client.query<Row>(
        `select id, name, status, bio from artists where slug = $1`,
        [slug],
      );
      const artist = artists[0];
      if (!artist) {
        console.log(`${slug}: not in production, skipped`);
        continue;
      }
      const { rows: layouts } = await client.query<Row>(
        `select id, status, "publishedBlocks", "draftBlocks" from page_layouts where "artistId" = $1 order by "createdAt"`,
        [artist.id],
      );
      const published = layouts.find(
        (layout) => layout.status === "PUBLISHED" && layout.publishedBlocks,
      );
      const blocksIn = (raw: unknown) =>
        (Array.isArray(raw) ? raw : ((raw as Row | null)?.blocks ?? [])) as unknown[];
      // A draft holding only the cover is just the starter page the editor creates: not their work.
      const drafted = layouts.find(
        (layout) =>
          blocksIn(layout.draftBlocks).filter((block) => (block as Row).type !== "cover").length >
          0,
      );
      if (published || drafted) {
        console.log(
          `${slug}: skipped, already has ${published ? "a published page" : "a draft"} of their own`,
        );
        continue;
      }

      const bio = artist.bio === "Bio not available." ? "" : (artist.bio ?? "");
      const specs = design.blocks(bio, ownContent(undefined));
      const blocks = [
        { uid: "cover", type: "cover", width: 4, hidden: false, settings: { align: "left" } },
        ...specs.map((spec, i) => ({
          uid: `b-${i + 1}`,
          type: spec.type,
          width: spec.width,
          hidden: spec.hidden ?? false,
          settings: spec.settings ?? {},
        })),
      ];
      const note =
        artist.status === "APPROVED" ? "" : ` (${artist.status}: not public until approved)`;
      const reuse = layouts[0];
      console.log(
        `${slug}: ${apply ? "writing" : "would write"} ${blocks.length - 1} blocks${note}${reuse ? " into their empty draft" : ""}`,
      );
      if (!apply) continue;

      const args = [
        "My page",
        JSON.stringify(design.theme),
        JSON.stringify(blocks),
        JSON.stringify({ blocks, theme: design.theme }),
      ];
      if (reuse)
        await client.query(
          `update page_layouts set name = $1, "isActive" = true, status = 'PUBLISHED', theme = $2::jsonb,
                  "draftBlocks" = $3::jsonb, "publishedBlocks" = $4::jsonb, "publishedAt" = now(), "updatedAt" = now()
            where id = $5`,
          [...args, reuse.id],
        );
      else
        await client.query(
          `insert into page_layouts (id, "artistId", name, "isActive", status, theme, "draftBlocks", "publishedBlocks", "publishedAt", "updatedAt")
           values ('c' || md5(random()::text || clock_timestamp()::text), $5, $1, true, 'PUBLISHED', $2::jsonb, $3::jsonb, $4::jsonb, now(), now())`,
          [...args, artist.id],
        );
      written.push(slug);
    }
    if (apply) {
      await client.query("COMMIT");
      console.log(`Wrote pages for: ${written.join(", ") || "nobody"}`);
    } else {
      await client.query("ROLLBACK");
      console.log("Dry run: nothing written. Add --apply to write.");
    }
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
