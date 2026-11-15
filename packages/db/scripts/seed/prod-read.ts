/**
 * Reads one artist's public catalogue from PRODUCTION. Read only: callers pass a client whose
 * session is read-only (or an open transaction), and this file only runs SELECTs.
 */
import pg from "pg";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function connectProduction(): Promise<pg.Client> {
  const url = process.env.PROD_DATABASE_URL;
  if (!url) throw new Error("Set PROD_DATABASE_URL.");
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 30_000 });
  await client.connect();
  return client;
}

export async function readProduction(client: pg.Client, slug: string) {
  const q = async (sql: string, params: unknown[] = []): Promise<Row[]> =>
    (await client.query(sql, params)).rows;
  const [artist] = await q(`select * from artists where slug = $1`, [slug]);
  if (!artist) return null;
  const id = artist.id as string;
  const [layout] = await q(
    `select "publishedBlocks" from page_layouts where "artistId" = $1 and status = 'PUBLISHED' and "isActive" = true limit 1`,
    [id],
  );
  return {
    artist,
    layout: layout?.publishedBlocks as unknown,
    albums: await q(
      `select id, title, slug, description, "coverUrl" from albums where "artistId" = $1`,
      [id],
    ),
    tiers: await q(
      `select name, description, features, "requiredTokens", "isPopular", "isActive", "sortOrder" from membership_tiers where "artistId" = $1`,
      [id],
    ),
    events: await q(
      `select title, description, "coverUrl", "startsAt", "endsAt", "venueName", address, latitude, longitude, link, "linkLabel", capacity from events where "artistId" = $1`,
      [id],
    ),
    items: await q(
      `select i.id, i.type, i."chainType", i.title, i.slug, i.description, i."coverUrl", i."playCount", i.supply, i.visibility,
              ct.code, m."durationSec", t."albumId", t."trackNumber",
              l."priceBandcoin", l."priceUsd"
         from items i
         left join classic_tokens ct on ct."itemId" = i.id
         left join item_media m on m."itemId" = i.id and m."mediaType" = 'AUDIO'
         left join tracks t on t."itemId" = i.id
         left join lateral (select "priceBandcoin", "priceUsd" from listings where "itemId" = i.id and status = 'ACTIVE' order by "createdAt" limit 1) l on true
        where i."artistId" = $1 and i."deletedAt" is null and i."hiddenAt" is null and (i.visibility <> 'DRAFT' or i.type = 'FAN_TOKEN')`,
      [id],
    ),
  };
}
