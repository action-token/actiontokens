/**
 * Fills the NEW dev database with demo content for every feature.
 *
 *   pnpm --filter @bandcoin/db seed         refuses if users already exist
 *   pnpm --filter @bandcoin/db seed:reset   empties every table first
 *
 * Only runs against the Bandcoin dev database (host check below). Page
 * templates are product data, so they are read from the old dev database.
 */
import "dotenv/config";

import { Keypair } from "@stellar/stellar-sdk";

import { db } from "../../src/client";
import { connectLegacyReadOnly } from "../migrate-legacy/legacy-db";
import {
  ADMIN,
  ARTISTS,
  FANS,
  REAL_ARTISTS,
  STUDIO_PACKAGES,
  STUDIO_PRICES,
  audio,
  cover,
  musicBounty,
  nudge,
  type DemoArtist,
} from "./demo-data";

const DEV_HOST_PREFIX = "ep-shy-leaf-";
const DAY = 86_400_000;

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
const fakeAddress = () => Keypair.random().publicKey();
const daysFromNow = (d: number) => new Date(Date.now() + d * DAY);

function assertDevDatabase() {
  const host = new URL(process.env.DATABASE_URL ?? "postgresql://x@missing/x").hostname;
  if (!host.startsWith(DEV_HOST_PREFIX))
    throw new Error(`Refusing to seed ${host}: only the Bandcoin dev database.`);
}

async function resetAllTables() {
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
  await db.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
  console.log(`Emptied ${tables.length} tables`);
}

async function seedSettings() {
  await db.appSetting.create({
    data: {
      id: 1,
      platformFeeBps: 250,
      nearbyPinRadiusMeters: 500,
      vanityMonthlyBandcoin: 50,
      vanityMonthlyUsd: 1,
      vanityNameChangeBandcoin: 200,
      vanityNameChangeUsd: 4,
      studioPrices: STUDIO_PRICES,
    },
  });
  await db.muralSettings.create({ data: { id: 1 } });
  await db.studioPackage.createMany({ data: STUDIO_PACKAGES });
}

/** Page-builder templates are product data: copy them from the old dev DB. */
async function copyPageTemplates() {
  try {
    const legacy = await connectLegacyReadOnly();
    const { rows } = await legacy.query(
      `SELECT key, name, description, "previewImage", "isSeedDefault", "order", blocks, theme FROM "LayoutTemplate"`,
    );
    await legacy.end();
    await db.pageTemplate.createMany({
      data: rows.map((r) => ({
        key: r.key,
        name: r.name,
        description: r.description,
        previewImageUrl: r.previewImage,
        isSeedDefault: r.isSeedDefault,
        sortOrder: r.order,
        blocks: r.blocks,
        theme: r.theme ?? undefined,
      })),
    });
    console.log(`Copied ${rows.length} page templates`);
  } catch (error) {
    console.warn("Page templates skipped:", (error as Error).message);
  }
}

async function seedPeople() {
  const admin = await db.user.create({
    data: {
      ...ADMIN,
      role: "ADMIN",
      walletAddress: fakeAddress(),
      signUpMethod: "email",
      avatarUrl: cover("admin", 200),
    },
  });
  const fans = [];
  for (const fan of FANS) {
    fans.push(
      await db.user.create({
        data: {
          ...fan,
          walletAddress: fakeAddress(),
          signUpMethod: "email",
          avatarUrl: cover(fan.username, 200),
        },
      }),
    );
  }
  for (const real of REAL_ARTISTS) {
    const user = await db.user.create({
      data: {
        walletAddress: real.walletAddress,
        displayName: real.name,
        username: real.slug,
        role: "ARTIST",
        signUpMethod: "wallet",
      },
    });
    await db.artist.create({
      data: { userId: user.id, name: real.name, slug: real.slug, status: "APPROVED" },
    });
  }
  return { admin, fans };
}

type Fan = Awaited<ReturnType<typeof seedPeople>>["fans"][number];

/** One demo artist with token, tiers, album, NFT, posts, pins, events, bounty. */
async function seedArtist(demo: DemoArtist, index: number, fans: Fan[]) {
  const user = await db.user.create({
    data: {
      email: demo.email,
      username: demo.slug,
      displayName: demo.name,
      role: "ARTIST",
      walletAddress: fakeAddress(),
      signUpMethod: "email",
      avatarUrl: cover(`${demo.slug}-avatar`, 200),
    },
  });
  // The artist's one issuer, for the fan token and every item (not on-chain: demo
  // keys are never stored, so these can't sign; real issuers are opened by the artist).
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
      name: demo.name,
      slug: demo.slug,
      bio: demo.bio,
      status: "APPROVED",
      avatarUrl: cover(`${demo.slug}-avatar`, 400),
      coverUrl: `https://picsum.photos/seed/bandcoin-${demo.slug}-cover/1600/500`,
    },
  });

  // Fan token + tiers ("hold N of it")
  const fanToken = await db.item.create({
    data: {
      type: "FAN_TOKEN",
      chainType: "CLASSIC_TOKEN",
      title: `$${demo.fanToken}`,
      slug: `${demo.slug}-token`,
      coverUrl: cover(`${demo.slug}-token`),
      artistId: artist.id,
      createdById: user.id,
      classicToken: { create: { code: demo.fanToken, issuer } },
      listings: { create: { sellerId: user.id, priceBandcoin: 500, priceUsd: 0.05 } },
    },
  });
  await db.artist.update({ where: { id: artist.id }, data: { fanTokenItemId: fanToken.id } });
  const [, insider] = await Promise.all([
    db.membershipTier.create({
      data: {
        artistId: artist.id,
        name: "Supporter",
        description: "Early listens and posts.",
        features: ["Early listens", "Member posts"],
        requiredTokens: 10,
        sortOrder: 0,
      },
    }),
    db.membershipTier.create({
      data: {
        artistId: artist.id,
        name: "Insider",
        description: "Stems, studio sessions, backstage pins.",
        features: ["Stems", "Studio sessions", "Backstage pins"],
        requiredTokens: 50,
        isPopular: true,
        sortOrder: 1,
      },
    }),
  ]);

  // Album and tracks; the last track is for the Insider tier
  const album = await db.album.create({
    data: {
      artistId: artist.id,
      title: demo.album.title,
      slug: slugify(`${demo.slug}-${demo.album.title}`),
      coverUrl: cover(`${demo.slug}-album`),
      description: `${demo.name}'s latest release.`,
    },
  });
  const tracks = [];
  for (const [i, track] of demo.album.tracks.entries()) {
    const isTierTrack = i === demo.album.tracks.length - 1;
    tracks.push(
      await db.item.create({
        data: {
          type: "TRACK",
          chainType: "CLASSIC_TOKEN",
          title: track.title,
          slug: slugify(`${demo.slug}-${track.title}`),
          description: `${track.title} by ${demo.name}.`,
          coverUrl: cover(`${demo.slug}-${i}`),
          supply: track.supply,
          visibility: isTierTrack ? "TIER" : "PUBLIC",
          tierId: isTierTrack ? insider.id : null,
          playCount: 100 * (i + 1) * (index + 1),
          artistId: artist.id,
          createdById: user.id,
          classicToken: { create: { code: `${demo.fanToken.slice(0, 6)}T${i + 1}`, issuer } },
          media: {
            create: {
              mediaType: "AUDIO",
              sourceUrl: audio(index * 3 + i + 1),
              durationSec: track.durationSec,
              previewStartSec: 30,
            },
          },
          track: { create: { albumId: album.id, artistName: demo.name, trackNumber: i + 1 } },
          listings: {
            create: {
              sellerId: user.id,
              priceBandcoin: track.priceBandcoin,
              priceUsd: track.priceUsd,
            },
          },
        },
      }),
    );
  }

  // A contract NFT with two editions owned by fans
  const nft = await db.item.create({
    data: {
      type: "TICKET",
      chainType: "CONTRACT_NFT",
      title: `${demo.album.title} VIP pass`,
      slug: slugify(`${demo.slug}-vip-pass`),
      description: "Backstage access and a signed digital poster.",
      coverUrl: cover(`${demo.slug}-vip`),
      supply: 25,
      artistId: artist.id,
      createdById: user.id,
      contractNft: { create: { status: "MINTED", mintedCount: 2, royaltyBps: 500 } },
      listings: { create: { sellerId: user.id, priceBandcoin: 120000, priceUsd: 12 } },
    },
  });
  for (const [i, fan] of fans.slice(0, 2).entries()) {
    await db.nftEdition.create({
      data: { itemId: nft.id, tokenId: `${demo.slug}-vip-${i + 1}`, ownerId: fan.id },
    });
  }

  // Fans: follow, own the first track (with a delivered order), favorite it
  const first = tracks[0]!;
  const firstListing = await db.listing.findFirstOrThrow({ where: { itemId: first.id } });
  for (const fan of fans) {
    await db.follow.create({ data: { userId: fan.id, artistId: artist.id } });
  }
  for (const fan of fans.slice(index % 2, (index % 2) + 2)) {
    await db.ownership.create({
      data: { userId: fan.id, itemId: first.id, quantity: 1, source: "PURCHASE" },
    });
    await db.order.create({
      data: {
        buyerId: fan.id,
        listingId: firstListing.id,
        itemId: first.id,
        quantity: 1,
        currency: "BANDCOIN",
        unitPrice: firstListing.priceBandcoin,
        platformFee: Number(firstListing.priceBandcoin) * 0.025,
        total: Number(firstListing.priceBandcoin) * 1.025,
        method: "WALLET",
        status: "DELIVERED",
      },
    });
    await db.trackFavorite.create({ data: { userId: fan.id, itemId: first.id } });
  }

  // Posts with likes and a comment
  const post = await db.post.create({
    data: {
      artistId: artist.id,
      title: `${demo.album.title} is out`,
      body: `Thank you for listening. Holders of ${demo.album.title} get the stems this week.`,
      media: { create: { type: "IMAGE", url: cover(`${demo.slug}-post`) } },
      collectibles: { createMany: { data: Array.from({ length: 100 }, () => ({})) } },
    },
  });
  await db.post.create({
    data: {
      artistId: artist.id,
      title: "Members only: studio notes",
      body: "How we recorded the last track.",
      tierId: insider.id,
      collectibles: { createMany: { data: Array.from({ length: 100 }, () => ({})) } },
    },
  });
  for (const fan of fans.slice(0, 3))
    await db.postLike.create({ data: { userId: fan.id, postId: post.id } });
  await db.postComment.create({
    data: { postId: post.id, authorId: fans[0]!.id, body: "On repeat all week." },
  });

  // Event, pins around the city, announcement, bounty
  const { lat, lng } = demo.city;
  const event = await db.event.create({
    data: {
      artistId: artist.id,
      title: `${demo.name} live in ${demo.city.name}`,
      description: "A small show with a listening party after.",
      coverUrl: cover(`${demo.slug}-event`),
      startsAt: daysFromNow(14),
      endsAt: daysFromNow(14.2),
      venueName: `${demo.city.name} Sound Room`,
      ...nudge(lat, lng, 300, 200),
      capacity: 150,
      rsvps: { create: fans.slice(0, 3).map((f) => ({ userId: f.id })) },
    },
  });
  const pinSpecs = [
    {
      title: "Listening party drop",
      type: "EVENT" as const,
      north: 300,
      east: 200,
      rewardsFanToken: true,
      eventId: event.id,
    },
    {
      title: `${demo.album.title} launch`,
      type: "LAUNCH" as const,
      north: -400,
      east: 350,
      rewardItemId: first.id,
    },
    {
      title: "Backstage secret",
      type: "EXPERIENCE" as const,
      north: 150,
      east: -500,
      rewardsFanToken: true,
      tierId: insider.id,
    },
  ];
  for (const spec of pinSpecs) {
    const at = nudge(lat, lng, spec.north, spec.east);
    await db.pin.create({
      data: {
        artistId: artist.id,
        title: spec.title,
        type: spec.type,
        description: `Walk here to collect from ${demo.name}.`,
        imageUrl: cover(`${demo.slug}-${slugify(spec.title)}`),
        ...at,
        radiusMeters: 50,
        claimLimit: 100,
        claimsLeft: 100,
        startsAt: daysFromNow(-1),
        endsAt: daysFromNow(30),
        approval: "APPROVED",
        rewardsFanToken: spec.rewardsFanToken ?? false,
        rewardItemId: spec.rewardItemId,
        eventId: spec.eventId,
        visibility: spec.tierId ? "TIER" : "PUBLIC",
        tierId: spec.tierId,
        spots: { create: [{ ...at }] },
      },
    });
  }
  await db.announcement.create({
    data: {
      artistId: artist.id,
      title: "New pins on the map",
      body: `Three drops around ${demo.city.name} this month.`,
      isPinned: true,
      ctaLabel: "Open the map",
      ctaUrl: "/map",
    },
  });
  await db.bounty.create({
    data: {
      artistId: artist.id,
      title: `Cover ${demo.album.tracks[0]!.title}`,
      summary: "Record your own version.",
      description: "Post a 60-second cover. The artist picks the winner.",
      instructions: ["Record up to 60 s", "Tag the artist"],
      prizeCurrency: "XLM",
      prizeAmount: 50,
      maxWinners: 1,
      escrowContractId: `demo-escrow-${demo.slug}`,
      fundTxHash: `demo-fund-${demo.slug}`,
      eventId: event.id,
    },
  });
  await db.bounty.create({ data: musicBounty(artist.id, demo) });
  if (index === 0) {
    await db.mapEmbed.create({
      data: {
        artistId: artist.id,
        name: "Website map",
        centerLat: lat,
        centerLng: lng,
        zoom: 13,
        pinSource: "ARTIST",
      },
    });
  }

  // Studio: a starting coin balance with its ledger entry
  await db.studioLedgerEntry.create({
    data: {
      userId: user.id,
      kind: "BONUS",
      status: "CONFIRMED",
      amount: 100,
      note: "Welcome bonus",
    },
  });
  await db.studioBalance.create({ data: { userId: user.id, balance: 100 } });

  return { artist, tracks };
}

async function seedFanExtras(fans: Fan[], allTracks: { id: string }[]) {
  for (const [i, fan] of fans.entries()) {
    await db.playlist.create({
      data: {
        ownerId: fan.id,
        name: i === 0 ? "Late night" : "Favourites",
        coverUrl: cover(`playlist-${fan.username}`),
        tracks: {
          create: allTracks.slice(i, i + 4).map((t, sortOrder) => ({ itemId: t.id, sortOrder })),
        },
      },
    });
  }
  // Two approved murals in New York, found by the first fan
  const finder = fans[0]!;
  for (const [i, m] of [
    { title: "Bedford Ave birds", north: 900, east: 300 },
    { title: "Canal St waves", north: -700, east: -200 },
  ].entries()) {
    const mural = await db.mural.create({
      data: {
        autoTitle: `Mural near ${m.title.split(" ").slice(0, 2).join(" ")}`,
        title: m.title,
        coverUrl: cover(`mural-${i}`),
        ...nudge(40.7128, -74.006, m.north, m.east),
        status: "APPROVED",
        discovererId: finder.id,
        distinctScanners: 3,
        scanCount: 5,
      },
    });
    await db.coinLedgerEntry.create({
      data: { userId: finder.id, amount: 60, reason: "MURAL_DISCOVERY", muralId: mural.id },
    });
  }
  await db.coinBalance.create({ data: { userId: finder.id, balance: 120 } });
}

async function main() {
  assertDevDatabase();
  if (process.argv.includes("--reset")) await resetAllTables();
  else if ((await db.user.count()) > 0)
    throw new Error("The database already has users. Use seed:reset to start over.");

  await seedSettings();
  await copyPageTemplates();
  const { fans } = await seedPeople();
  const allTracks = [];
  for (const [i, demo] of ARTISTS.entries()) {
    const { tracks } = await seedArtist(demo, i, fans);
    allTracks.push(...tracks);
    console.log(`Seeded ${demo.name}`);
  }
  await seedFanExtras(fans, allTracks);

  const counts = await Promise.all([
    db.user.count(),
    db.artist.count(),
    db.item.count(),
    db.listing.count(),
    db.pin.count(),
    db.bounty.count(),
  ]);
  console.log(
    `Done: ${counts[0]} users, ${counts[1]} artists, ${counts[2]} items, ${counts[3]} listings, ${counts[4]} pins, ${counts[5]} bounties`,
  );
}

await main().finally(() => db.$disconnect());
