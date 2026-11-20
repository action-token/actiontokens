/**
 * Copies the public catalogue of REAL artists from production into the dev database and
 * gives each a designed artist page, so the pages can be judged with real names, covers,
 * albums, tour dates and tiers.
 *
 *   PROD_DATABASE_URL=... pnpm --filter @actiontokens/db exec tsx scripts/seed/real-artists.ts
 *
 * Production is only ever READ (the session is read-only). Nothing private is copied:
 * artists get a fake user, fake issuer keys and SoundHelix demo audio, never the real
 * emails, wallets, secrets or audio. Safe to run again: an artist already in dev keeps
 * its data and only has its page re-published. Only runs against the Bandcoin dev database.
 *
 * The page rules (and the few per-artist notes) are in artist-designs.ts. Facts there
 * come from the artist's own profile or a public source named next to it; nothing is
 * invented for an artist the web has nothing on.
 */
import "dotenv/config";

import { Keypair } from "@stellar/stellar-sdk";

import { db } from "../../src/client";
import type { Prisma } from "../../src/index";
import { factsFrom, pageJson } from "./artist-designs";
import { audio, cover } from "./demo-data";
import { connectProduction, readProduction } from "./prod-read";

type ProdData = NonNullable<Awaited<ReturnType<typeof readProduction>>>;

/** The real artists copied into dev, in the order they are listed. */
const SLUGS = [
  "3-years-hollow",
  "hollowvox",
  "hillbilly-headspace",
  "tamethejester",
  "instamix",
  "band-together",
  "creator-hannah",
];

const DEV_HOST_PREFIX = "ep-red-sea-";
const fakeAddress = () => Keypair.random().publicKey();

/** Prisma wants JSON columns typed as its own JSON type; these are plain objects. */
const json = (value: unknown) => value as Prisma.InputJsonValue;

function assertDevDatabase() {
  const host = new URL(process.env.DATABASE_URL ?? "postgresql://x@missing/x").hostname;
  if (!host.startsWith(DEV_HOST_PREFIX))
    throw new Error(`Refusing to write to ${host}: only the Bandcoin dev database.`);
}

async function importArtist(slug: string, data: ProdData) {
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
  const artist = await db.organization.create({
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
        organizationId: artist.id,
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
        organizationId: artist.id,
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
      organizationId: artist.id,
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
      await db.organization.update({ where: { id: artist.id }, data: { fanTokenItemId: created.id } });
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
        organizationId: artist.id,
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
  organization: {
    id: string;
    slug: string;
    fanTokenItemId: string | null;
    issuerAccountId: string | null;
    userId: string;
  },
  data: ProdData,
) {
  const token = data.items.find((item) => item.type === "FAN_TOKEN");
  if (organization.fanTokenItemId || !token || !organization.issuerAccountId) return;
  const issuer = await db.chainAccount.findUnique({ where: { id: organization.issuerAccountId } });
  if (!issuer) return;
  const created = await db.item.create({
    data: {
      type: "FAN_TOKEN",
      chainType: "CLASSIC_TOKEN",
      title: token.title,
      slug: `${organization.slug}-${token.slug}`.slice(0, 90),
      description: token.description,
      coverUrl: token.coverUrl ?? cover(`${organization.slug}-token`),
      visibility: "PUBLIC",
      organizationId: organization.id,
      createdById: organization.userId,
      classicToken: {
        create: {
          code: token.code ?? token.title.replace(/\W/g, "").slice(0, 12),
          issuer: issuer.publicKey,
        },
      },
    },
  });
  await db.organization.update({ where: { id: organization.id }, data: { fanTokenItemId: created.id } });
}

async function publish(organizationId: string, data: ProdData) {
  const design = pageJson(factsFrom(data));
  const row = {
    name: "My page",
    isActive: true,
    status: "PUBLISHED" as const,
    theme: json(design.theme),
    draftBlocks: json(design.blocks),
    publishedBlocks: json(design),
    publishedAt: new Date(),
  };
  const existing = await db.pageLayout.findFirst({
    where: { organizationId },
    orderBy: { createdAt: "asc" },
  });
  if (existing) await db.pageLayout.update({ where: { id: existing.id }, data: row });
  else await db.pageLayout.create({ data: { ...row, organizationId } });
}

async function main() {
  assertDevDatabase();
  const only = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const fans = await db.user.findMany({
    where: { email: { endsWith: "@demo.bandcoin.io" }, role: "FAN" },
    take: 4,
  });
  const prod = await connectProduction();
  try {
    await prod.query("SET default_transaction_read_only = on");
    for (const slug of SLUGS) {
      if (only.length > 0 && !only.includes(slug)) continue;
      const data = await readProduction(prod, slug);
      if (!data) {
        console.log(`${slug}: not in production, skipped`);
        continue;
      }
      const artist =
        (await db.organization.findUnique({ where: { slug } })) ?? (await importArtist(slug, data));
      await ensureFanToken(artist, data);
      await db.follow.createMany({
        data: fans.map((fan) => ({ userId: fan.id, organizationId: artist.id })),
        skipDuplicates: true,
      });
      await publish(artist.id, data);
      console.log(`${slug}: imported and published`);
    }
  } finally {
    await prod.end();
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void db.$disconnect());
