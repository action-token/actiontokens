/**
 * Copies the public catalogue of REAL artists from production into the dev database and
 * gives each a designed artist page, so the pages can be judged with real names, covers,
 * albums, tour dates and tiers.
 *
 *   PROD_DATABASE_URL=... pnpm --filter @bandcoin/db exec tsx scripts/seed/real-artists.ts
 *
 * Production is only ever READ (the session is read-only). Nothing private is copied:
 * artists get a fake user, fake issuer keys and SoundHelix demo audio, never the real
 * emails, wallets, secrets or audio. Safe to run again: an artist already in dev keeps
 * its data and only has its page re-published. Only runs against the Bandcoin dev database.
 *
 * The design notes (who, what the page says and why) are in DESIGN below. Facts there
 * come from the artist's own profile or a public source named next to it; nothing is
 * invented for an artist the web has nothing on.
 */
import "dotenv/config";

import { Keypair } from "@stellar/stellar-sdk";
import pg from "pg";

import { db } from "../../src/client";
import type { Prisma } from "../../src/index";
import { DESIGN, ownContent, type Design, type OwnContent } from "./artist-designs";
import { audio, cover } from "./demo-data";

const DEV_HOST_PREFIX = "ep-red-sea-";
const fakeAddress = () => Keypair.random().publicKey();

/** Prisma wants JSON columns typed as its own JSON type; these are plain objects. */
const json = (value: unknown) => value as Prisma.InputJsonValue;

function assertDevDatabase() {
  const host = new URL(process.env.DATABASE_URL ?? "postgresql://x@missing/x").hostname;
  if (!host.startsWith(DEV_HOST_PREFIX))
    throw new Error(`Refusing to write to ${host}: only the Bandcoin dev database.`);
}

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function readProduction(slug: string) {
  const url = process.env.PROD_DATABASE_URL;
  if (!url) throw new Error("Set PROD_DATABASE_URL (read-only use).");
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 30_000 });
  await client.connect();
  try {
    await client.query("SET default_transaction_read_only = on");
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
  } finally {
    await client.end();
  }
}

async function importArtist(
  slug: string,
  data: NonNullable<Awaited<ReturnType<typeof readProduction>>>,
) {
  const a = data.artist;
  const user = await db.user.create({
    data: {
      email: `${slug}@demo.bandcoin.io`,
      username: slug.replace(/[^a-z0-9_-]/g, "").slice(0, 30),
      displayName: a.name,
      role: "ARTIST",
      walletAddress: fakeAddress(),
      signUpMethod: "email",
      avatarUrl: a.avatarUrl,
    },
  });
  const issuer = fakeAddress();
  const issuerAccount = await db.chainAccount.create({
    data: {
      kind: "ISSUER",
      publicKey: issuer,
      secretEncrypted: "demo:no-secret",
      ownerId: user.id,
    },
  });
  const artist = await db.artist.create({
    data: {
      userId: user.id,
      issuerAccountId: issuerAccount.id,
      name: a.name,
      slug,
      bio: a.bio === "Bio not available." ? null : a.bio,
      // A pending artist has no public page in production; dev shows it so the design can be seen.
      status: "APPROVED",
      avatarUrl: a.avatarUrl,
      coverUrl: a.coverUrl,
      website: a.website,
      instagram: a.instagram,
      twitter: a.twitter,
    },
  });

  for (const tier of data.tiers)
    await db.membershipTier.create({
      data: {
        artistId: artist.id,
        name: tier.name,
        description: tier.description ?? "",
        features: tier.features ?? [],
        requiredTokens: tier.requiredTokens,
        isPopular: tier.isPopular,
        isActive: tier.isActive,
        sortOrder: tier.sortOrder,
      },
    });

  const albumBySourceId = new Map<string, string>();
  for (const [i, album] of data.albums.entries()) {
    const row = await db.album.create({
      data: {
        artistId: artist.id,
        title: album.title,
        slug: `${slug}-${album.slug}`.slice(0, 80),
        coverUrl: album.coverUrl ?? cover(`${slug}-album-${i}`),
        description: album.description,
      },
    });
    albumBySourceId.set(album.id, row.id);
  }

  let n = 0;
  for (const item of data.items) {
    n += 1;
    const listing = item.priceBandcoin
      ? {
          create: {
            sellerId: user.id,
            priceBandcoin: item.priceBandcoin,
            priceUsd: item.priceUsd ?? 1,
          },
        }
      : undefined;
    const base = {
      title: item.title,
      slug: `${slug}-${item.slug}`.slice(0, 90),
      description: item.description,
      coverUrl: item.coverUrl ?? cover(`${slug}-item-${n}`),
      supply: item.supply,
      visibility: "PUBLIC" as const,
      playCount: item.playCount ?? 0,
      artistId: artist.id,
      createdById: user.id,
      listings: listing,
    };
    if (item.type === "FAN_TOKEN") {
      const created = await db.item.create({
        data: {
          ...base,
          type: "FAN_TOKEN",
          chainType: "CLASSIC_TOKEN",
          classicToken: {
            create: { code: item.code ?? item.title.replace(/\W/g, "").slice(0, 12), issuer },
          },
        },
      });
      await db.artist.update({ where: { id: artist.id }, data: { fanTokenItemId: created.id } });
    } else if (item.type === "TRACK" && item.chainType === "CLASSIC_TOKEN") {
      await db.item.create({
        data: {
          ...base,
          type: "TRACK",
          chainType: "CLASSIC_TOKEN",
          classicToken: {
            create: { code: `${(item.code ?? "T").slice(0, 8)}${n}`.slice(0, 12), issuer },
          },
          // Demo audio, never the real files.
          media: {
            create: {
              mediaType: "AUDIO",
              sourceUrl: audio((n % 16) + 1),
              durationSec: item.durationSec ?? 180,
              previewStartSec: 30,
            },
          },
          track: {
            create: {
              albumId: item.albumId ? (albumBySourceId.get(item.albumId) ?? null) : null,
              artistName: a.name,
              trackNumber: item.trackNumber ?? n,
            },
          },
        },
      });
    } else if (item.chainType === "CONTRACT_NFT") {
      await db.item.create({
        data: {
          ...base,
          type: item.type,
          chainType: "CONTRACT_NFT",
          contractNft: { create: { status: "MINTED", mintedCount: 0, royaltyBps: 500 } },
        },
      });
    }
  }

  for (const event of data.events)
    await db.event.create({
      data: {
        artistId: artist.id,
        title: event.title,
        description: event.description,
        coverUrl: event.coverUrl,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        venueName: event.venueName,
        address: event.address,
        latitude: event.latitude,
        longitude: event.longitude,
        link: event.link,
        linkLabel: event.linkLabel,
        capacity: event.capacity,
      },
    });
  return artist;
}

/** An artist imported before their fan token was (a token is DRAFT in production, so it was skipped once). */
async function ensureFanToken(
  artist: {
    id: string;
    slug: string;
    fanTokenItemId: string | null;
    issuerAccountId: string | null;
    userId: string;
  },
  data: NonNullable<Awaited<ReturnType<typeof readProduction>>>,
) {
  const token = data.items.find((item) => item.type === "FAN_TOKEN");
  if (artist.fanTokenItemId || !token || !artist.issuerAccountId) return;
  const issuer = await db.chainAccount.findUnique({ where: { id: artist.issuerAccountId } });
  if (!issuer) return;
  const created = await db.item.create({
    data: {
      type: "FAN_TOKEN",
      chainType: "CLASSIC_TOKEN",
      title: token.title,
      slug: `${artist.slug}-${token.slug}`.slice(0, 90),
      description: token.description,
      coverUrl: token.coverUrl ?? cover(`${artist.slug}-token`),
      visibility: "PUBLIC",
      artistId: artist.id,
      createdById: artist.userId,
      classicToken: {
        create: {
          code: token.code ?? token.title.replace(/\W/g, "").slice(0, 12),
          issuer: issuer.publicKey,
        },
      },
    },
  });
  await db.artist.update({ where: { id: artist.id }, data: { fanTokenItemId: created.id } });
}

async function publish(artistId: string, design: Design, bio: string, own: OwnContent) {
  const specs = design.blocks(bio, own);
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
  const data = {
    name: "My page",
    isActive: true,
    status: "PUBLISHED" as const,
    theme: json(design.theme),
    draftBlocks: json(blocks),
    publishedBlocks: json({ blocks, theme: design.theme }),
    publishedAt: new Date(),
  };
  const existing = await db.pageLayout.findFirst({ where: { artistId } });
  if (existing) await db.pageLayout.update({ where: { id: existing.id }, data });
  else await db.pageLayout.create({ data: { ...data, artistId } });
}

async function main() {
  assertDevDatabase();
  const only = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const fans = await db.user.findMany({
    where: { email: { endsWith: "@demo.bandcoin.io" }, role: "FAN" },
    take: 4,
  });
  for (const slug of Object.keys(DESIGN)) {
    if (only.length > 0 && !only.includes(slug)) continue;
    const data = await readProduction(slug);
    if (!data) {
      console.log(`${slug}: not in production, skipped`);
      continue;
    }
    const artist =
      (await db.artist.findUnique({ where: { slug } })) ?? (await importArtist(slug, data));
    await ensureFanToken(artist, data);
    await db.follow.createMany({
      data: fans.map((fan) => ({ userId: fan.id, artistId: artist.id })),
      skipDuplicates: true,
    });
    const bio = data.artist.bio === "Bio not available." ? "" : (data.artist.bio ?? "");
    await publish(artist.id, DESIGN[slug]!, bio, ownContent(data.layout));
    console.log(`${slug}: imported and published`);
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void db.$disconnect());
