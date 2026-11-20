/**
 * Rebuilds the artist page of every real artist on PRODUCTION from what they have now
 * (songs, albums, collectibles, tiers, tour dates, their own bio, links and videos).
 *
 *   PROD_DATABASE_URL=... pnpm --filter @actiontokens/db exec tsx scripts/seed/prod-layouts.ts          (dry run)
 *   PROD_DATABASE_URL=... pnpm --filter @actiontokens/db exec tsx scripts/seed/prod-layouts.ts --apply  (writes)
 *
 *   - Dry run unless --apply. It prints, per artist, what the new page is made of.
 *   - Replaces the artist's current page. Before that, the old page is saved as a second,
 *     inactive layout ("Previous page (backup)") in the same table, so it can be restored.
 *     An existing backup is never overwritten.
 *   - Their own words survive: the About text, videos, links and band lineup they typed into
 *     their old page are carried into the new one (what they hid stays hidden).
 *   - Writes only page_layouts. No bio, picture, link, item, price or account is touched.
 *   - Stubs with nothing (no photo, bio, music, tiers or page) are left alone.
 *   - One transaction: any failure writes nothing.
 */
import "dotenv/config";

import { factsFrom, hasSubstance, pageJson } from "./artist-designs";
import { connectProduction, readProduction } from "./prod-read";

const BACKUP_NAME = "Previous page (backup)";

async function main() {
  const apply = process.argv.includes("--apply");
  const client = await connectProduction();
  try {
    await client.query("BEGIN");
    if (!apply) await client.query("SET TRANSACTION READ ONLY");
    const { rows: artists } = await client.query<{ slug: string }>(
      `select slug from artists order by "createdAt"`,
    );
    const written: string[] = [];
    for (const { slug } of artists) {
      const data = await readProduction(client, slug);
      if (!data) continue;
      const { rows: layouts } = await client.query(
        `select id, name, status, "isActive", theme, "draftBlocks", "publishedBlocks", "templateKey" from page_layouts where "organizationId" = $1 order by "createdAt"`,
        [data.artist.id],
      );
      const facts = factsFrom(data);
      if (!hasSubstance(facts, Boolean(data.layout))) {
        console.log(`${slug}: left alone (nothing to build a page from yet)`);
        continue;
      }
      const page = pageJson(facts);
      const shown = page.blocks.slice(1).filter((block) => !block.hidden);
      const mine = layouts.find((layout) => layout.name !== BACKUP_NAME);
      const hasBackup = layouts.some((layout) => layout.name === BACKUP_NAME);
      const worthKeeping =
        mine &&
        (mine.publishedBlocks || (Array.isArray(mine.draftBlocks) && mine.draftBlocks.length > 1));
      const status =
        data.artist.status === "APPROVED"
          ? ""
          : ` [${data.artist.status}: not public until approved]`;
      console.log(
        `${slug}: ${apply ? "rebuilding" : "would rebuild"}${status} — songs ${facts.tracks}, albums ${facts.albums}, collectibles ${facts.collectibles}, tiers ${facts.tiers}, shows ${facts.events}` +
          `; blocks: ${shown.map((block) => block.type).join(", ")}` +
          (worthKeeping && !hasBackup ? "; old page backed up" : ""),
      );
      if (!apply) continue;

      if (worthKeeping && !hasBackup)
        await client.query(
          `insert into page_layouts (id, "organizationId", name, "isActive", status, theme, "draftBlocks", "publishedBlocks", "templateKey", "updatedAt")
           values ('c' || md5(random()::text || clock_timestamp()::text), $1, $2, false, 'DRAFT', $3::jsonb, $4::jsonb, $5::jsonb, $6, now())`,
          [
            data.artist.id,
            BACKUP_NAME,
            JSON.stringify(mine.theme),
            JSON.stringify(mine.draftBlocks),
            JSON.stringify(mine.publishedBlocks),
            mine.templateKey,
          ],
        );

      const args = [
        JSON.stringify(page.theme),
        JSON.stringify(page.blocks),
        JSON.stringify({ blocks: page.blocks, theme: page.theme }),
      ];
      if (mine)
        await client.query(
          `update page_layouts set name = 'My page', "isActive" = true, status = 'PUBLISHED', theme = $1::jsonb,
                  "draftBlocks" = $2::jsonb, "publishedBlocks" = $3::jsonb, "publishedAt" = now(), "updatedAt" = now()
            where id = $4`,
          [...args, mine.id],
        );
      else
        await client.query(
          `insert into page_layouts (id, "organizationId", name, "isActive", status, theme, "draftBlocks", "publishedBlocks", "publishedAt", "updatedAt")
           values ('c' || md5(random()::text || clock_timestamp()::text), $4, 'My page', true, 'PUBLISHED', $1::jsonb, $2::jsonb, $3::jsonb, now(), now())`,
          [...args, data.artist.id],
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
