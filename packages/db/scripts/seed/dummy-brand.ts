/**
 * Two invented artists for trying out artist-page layouts, added to the dev database
 * without resetting it:
 *
 *   - Harbor Lights (harbor-lights): a full brand with every kind of content
 *   - a sparse one with a very long name, no pictures and almost no content
 *     (the-extraordinarily-long-named-orchestra), for the odd cases
 *
 *   pnpm --filter @actiontokens/db exec tsx scripts/seed/dummy-brand.ts [--layout <preset>]
 *
 * Creating them happens once; after that only their published page changes, to the
 * chosen layout preset (see LAYOUTS). Only runs against the Bandcoin dev database.
 */
import "dotenv/config";

import { Keypair } from "@stellar/stellar-sdk";

import { db } from "../../src/client";
import { assertWritable } from "../guard";
import type { Prisma } from "../../src/index";
import { audio, banner, cover, nudge } from "./demo-data";

const DAY = 86_400_000;
const daysFromNow = (d: number) => new Date(Date.now() + d * DAY);
const fakeAddress = () => Keypair.random().publicKey();

/** Prisma wants JSON columns typed as its own JSON type; these are plain objects. */
const json = (value: unknown) => value as Prisma.InputJsonValue;

const FULL = "harbor-lights";
const SPARSE = "the-extraordinarily-long-named-orchestra";

type Width = 1 | 2 | 3 | 4;
type Spec = { type: string; width?: Width; hidden?: boolean; settings?: Record<string, unknown> };
type Theme = { accent: string; fontPair: string; radius: string; density: string };

const ABOUT =
  "Harbor Lights is a four-piece from a fishing town that only gets two buses a day. We write slow-building songs about ferries, fog and leaving home, and record them in a converted boathouse with the doors open, so you can hear the gulls on most of them. Holders of $HARBOR get every stem, early mixes and a vote on the next single.";
const LINKS = [
  { label: "Tour diary", url: "https://example.com/harbor-lights/diary" },
  { label: "Merch shop", url: "https://example.com/harbor-lights/shop" },
  { label: "Press kit", url: "https://example.com/harbor-lights/press" },
];
// Open films from the Blender Foundation (free to embed).
const VIDEOS = [
  { title: "Low Tide (live in the boathouse)", url: "https://www.youtube.com/watch?v=aqz-KE-bpKQ" },
  { title: "Night Ferry", url: "https://www.youtube.com/watch?v=eRsGyueVLvQ" },
  { title: "Foghorn (studio session)", url: "https://www.youtube.com/watch?v=R6MlUcmOul8" },
  { title: "Salt & Static", url: "https://www.youtube.com/watch?v=WhWc3b3KhnY" },
];
const MEMBERS = [
  { name: "Ines Varga", role: "Vocals, guitar", photoUrl: cover("harbor-ines") },
  { name: "Tomas Reyes", role: "Bass", photoUrl: cover("harbor-tomas") },
  { name: "Ola Brandt", role: "Drums", photoUrl: cover("harbor-ola") },
  { name: "Sunny Achebe", role: "Keys, field recordings", photoUrl: cover("harbor-sunny") },
];

/** Every block, with its content; presets set width and style. */
const content = (type: string): Record<string, unknown> =>
  ({
    about: { body: ABOUT },
    links: { links: LINKS, showSocials: true },
    videos: { videos: VIDEOS },
    "band-members": { members: MEMBERS },
  })[type] ?? {};

const b = (type: string, width: Width = 4, style?: string): Spec => ({
  type,
  width,
  settings: { ...content(type), ...(style ? { style } : {}) },
});

/** Ways to arrange the full brand's page. */
const LAYOUTS: Record<string, { theme: Theme; blocks: Spec[] }> = {
  // Everything full width, default styles
  full: {
    theme: { accent: "#dbdc2c", fontPair: "grotesk", radius: "md", density: "normal" },
    blocks: [
      b("music"),
      b("releases"),
      b("nft-gallery"),
      b("membership"),
      b("tour"),
      b("about"),
      b("videos"),
      b("band-members"),
      b("links"),
    ],
  },
  // Everything full width, the other styles
  alt: {
    theme: { accent: "#7c3aed", fontPair: "serif", radius: "sm", density: "spacious" },
    blocks: [
      b("about", 4, "card"),
      b("music", 4, "cards"),
      b("releases", 4, "grid"),
      b("nft-gallery", 4, "row"),
      b("membership"),
      b("tour", 4, "tickets"),
      b("videos", 4, "featured"),
      b("band-members", 4, "cards"),
      b("links", 4, "chips"),
    ],
  },
  // Pairs of halves (like a streaming app's two-column sections)
  halves: {
    theme: { accent: "#ff5d73", fontPair: "sans", radius: "md", density: "compact" },
    blocks: [
      b("music", 2),
      b("about", 2, "card"),
      b("releases", 2),
      b("nft-gallery", 2),
      b("tour", 2),
      b("links", 2),
      b("membership", 2),
      b("band-members", 2),
      b("videos", 2, "featured"),
      b("about", 2, "quote"),
    ],
  },
  // Three quarters next to a quarter, both ways round
  quarters: {
    theme: { accent: "#1d4ed8", fontPair: "grotesk", radius: "none", density: "normal" },
    blocks: [
      b("music", 3),
      b("links", 1),
      b("about", 1, "quote"),
      b("releases", 3),
      b("nft-gallery", 3, "row"),
      b("band-members", 1),
      b("tour", 1),
      b("membership", 3),
      b("videos", 3),
      b("about", 1, "card"),
    ],
  },
  // Four quarters in a row, every block narrow
  narrow: {
    theme: { accent: "#ea580c", fontPair: "sans", radius: "sm", density: "compact" },
    blocks: [
      b("music", 1),
      b("membership", 1),
      b("tour", 1, "tickets"),
      b("links", 1, "chips"),
      b("releases", 1, "grid"),
      b("nft-gallery", 1),
      b("videos", 1, "featured"),
      b("band-members", 1, "cards"),
      b("about", 1, "card"),
      b("music", 1, "cards"),
      b("releases", 1),
      b("tour", 1),
    ],
  },
  // Rows that don't add up to four columns, leaving gaps
  ragged: {
    theme: { accent: "#39ff88", fontPair: "serif", radius: "md", density: "spacious" },
    blocks: [
      b("about", 2),
      b("music", 4),
      b("tour", 3),
      b("links", 2),
      b("membership", 4),
      b("band-members", 1, "cards"),
      b("videos", 2),
      b("releases", 3, "grid"),
      b("nft-gallery", 1, "row"),
    ],
  },
};

/** The sparse artist always gets every block, half width, so the thin content shows. */
const SPARSE_BLOCKS: Spec[] = [
  b("music", 2),
  b("membership", 2),
  b("tour", 2, "tickets"),
  { type: "about", width: 2, settings: { style: "card", body: "We play twice a year." } },
  b("releases", 4),
  b("nft-gallery", 4),
];

function assertDevDatabase() {
  assertWritable(process.env.DATABASE_URL, "seed");
}

type Album = { title: string; tracks: string[] };

async function createArtist(opts: {
  slug: string;
  name: string;
  bio: string;
  token: string;
  pictures: boolean;
  socials: boolean;
  albums: Album[];
  tiers: { name: string; tokens: number; features: string[]; popular?: boolean }[];
  events: { title: string; venue: string; address?: string; inDays: number }[];
  collectibles: string[];
}) {
  const user = await db.user.create({
    data: {
      email: `${opts.slug}@demo.bandcoin.io`,
      username: opts.slug.slice(0, 30),
      displayName: opts.name,
      role: "ARTIST",
      walletAddress: fakeAddress(),
      signUpMethod: "email",
      avatarUrl: opts.pictures ? cover(`${opts.slug}-avatar`, 200) : null,
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
      name: opts.name,
      slug: opts.slug,
      bio: opts.bio,
      status: "APPROVED",
      avatarUrl: opts.pictures ? cover(`${opts.slug}-avatar`, 400) : null,
      coverUrl: opts.pictures ? banner(`${opts.slug}-cover`) : null,
      website: opts.socials ? "https://example.com/harbor-lights" : null,
      instagram: opts.socials ? "@harborlights.band" : null,
      twitter: opts.socials ? "harborlights" : null,
    },
  });

  const fanToken = await db.item.create({
    data: {
      type: "FAN_TOKEN",
      chainType: "CLASSIC_TOKEN",
      title: `$${opts.token}`,
      slug: `${opts.slug}-token`,
      coverUrl: cover(`${opts.slug}-token`),
      organizationId: artist.id,
      createdById: user.id,
      classicToken: { create: { code: opts.token, issuer } },
      listings: { create: { sellerId: user.id, priceBandcoin: 500, priceUsd: 0.05 } },
    },
  });
  await db.organization.update({ where: { id: artist.id }, data: { fanTokenItemId: fanToken.id } });

  for (const [i, tier] of opts.tiers.entries())
    await db.membershipTier.create({
      data: {
        organizationId: artist.id,
        name: tier.name,
        description: tier.features.length ? `${tier.features[0]} and more.` : "",
        features: tier.features,
        requiredTokens: tier.tokens,
        isPopular: tier.popular ?? false,
        sortOrder: i,
      },
    });

  let n = 0;
  for (const [a, album] of opts.albums.entries()) {
    const row = await db.album.create({
      data: {
        organizationId: artist.id,
        title: album.title,
        slug: `${opts.slug}-album-${a + 1}`,
        coverUrl: cover(`${opts.slug}-album-${a}`),
        description: `${album.title} by ${opts.name}.`,
      },
    });
    for (const [t, title] of album.tracks.entries()) {
      n += 1;
      await db.item.create({
        data: {
          type: "TRACK",
          chainType: "CLASSIC_TOKEN",
          title,
          slug: `${opts.slug}-track-${n}`,
          description: `${title} by ${opts.name}.`,
          coverUrl: cover(`${opts.slug}-track-${n}`),
          supply: 100,
          visibility: "PUBLIC",
          playCount: 1500 - n * 97,
          organizationId: artist.id,
          createdById: user.id,
          classicToken: { create: { code: `${opts.token.slice(0, 6)}T${n}`, issuer } },
          media: {
            create: {
              mediaType: "AUDIO",
              sourceUrl: audio((n % 16) + 1),
              durationSec: 150 + ((n * 37) % 160),
              previewStartSec: 30,
            },
          },
          track: { create: { albumId: row.id, artistName: opts.name, trackNumber: t + 1 } },
          listings: {
            create: { sellerId: user.id, priceBandcoin: 5000 + n * 1500, priceUsd: 0.99 },
          },
        },
      });
    }
  }

  for (const [i, title] of opts.collectibles.entries())
    await db.item.create({
      data: {
        type: "TICKET",
        chainType: "CONTRACT_NFT",
        title,
        slug: `${opts.slug}-collectible-${i + 1}`,
        description: "A limited collectible.",
        coverUrl: cover(`${opts.slug}-collectible-${i}`),
        supply: 25,
        organizationId: artist.id,
        createdById: user.id,
        contractNft: { create: { status: "MINTED", mintedCount: 0, royaltyBps: 500 } },
        listings: { create: { sellerId: user.id, priceBandcoin: 40000 + i * 20000, priceUsd: 5 } },
      },
    });

  for (const [i, event] of opts.events.entries())
    await db.event.create({
      data: {
        organizationId: artist.id,
        title: event.title,
        description: "Doors at seven.",
        coverUrl: opts.pictures ? cover(`${opts.slug}-event-${i}`) : null,
        startsAt: daysFromNow(event.inDays),
        endsAt: daysFromNow(event.inDays + 0.2),
        venueName: event.venue,
        address: event.address ?? null,
        ...nudge(53.35, -6.26, i * 300, i * 200),
        capacity: 200,
      },
    });

  return artist;
}

/** A few demo fans follow them (if the main seed has run). Safe to run again. */
async function addFollowers(organizationId: string) {
  const fans = await db.user.findMany({
    where: { email: { endsWith: "@demo.bandcoin.io" }, role: "FAN" },
    take: 4,
  });
  await db.follow.createMany({
    data: fans.map((fan) => ({ userId: fan.id, organizationId })),
    skipDuplicates: true,
  });
}

async function publish(organizationId: string, theme: Theme, specs: Spec[]) {
  const blocks = [
    { uid: "cover", type: "cover", width: 4, hidden: false, settings: { align: "left" } },
    ...specs.map((spec, i) => ({
      uid: `b-${i + 1}`,
      type: spec.type,
      width: spec.width ?? 4,
      hidden: spec.hidden ?? false,
      settings: spec.settings ?? {},
    })),
  ];
  const design = { blocks, theme };
  const existing = await db.pageLayout.findFirst({ where: { organizationId } });
  const data = {
    name: "My page",
    isActive: true,
    status: "PUBLISHED" as const,
    theme: json(theme),
    draftBlocks: json(blocks),
    publishedBlocks: json(design),
    publishedAt: new Date(),
  };
  if (existing) await db.pageLayout.update({ where: { id: existing.id }, data });
  else await db.pageLayout.create({ data: { ...data, organizationId } });
}

async function main() {
  assertDevDatabase();
  const flag = process.argv.indexOf("--layout");
  const preset = flag > -1 ? process.argv[flag + 1]! : "full";
  const layout = LAYOUTS[preset];
  if (!layout) throw new Error(`No layout "${preset}". Try: ${Object.keys(LAYOUTS).join(", ")}`);

  const full =
    (await db.organization.findUnique({ where: { slug: FULL } })) ??
    (await createArtist({
      slug: FULL,
      name: "Harbor Lights",
      bio: "Slow-building songs about ferries, fog and leaving home.",
      token: "HARBOR",
      pictures: true,
      socials: true,
      albums: [
        {
          title: "Low Tide",
          tracks: ["Low Tide", "Ferry Lights", "Undertow", "Salt in the Wires", "Breakwater"],
        },
        { title: "Lighthouse Sessions", tracks: ["Foghorn", "Keeper", "North Pier"] },
        { title: "Salt & Static", tracks: ["Salt & Static", "Radio Gull"] },
        { title: "Night Ferry", tracks: ["Night Ferry"] },
        {
          title: "A Very Long Album Title That Keeps Going Past the Edge",
          tracks: ["The Song With the Longest Title We Could Think Of (Extended Harbour Mix)"],
        },
      ],
      tiers: [
        { name: "Deckhand", tokens: 10, features: ["Early listens", "Member posts"] },
        {
          name: "Crew",
          tokens: 50,
          features: ["Every stem", "Studio sessions", "Vote on the next single"],
          popular: true,
        },
        {
          name: "Captain",
          tokens: 250,
          features: ["Everything in Crew", "A line in the liner notes", "Two guest-list spots"],
        },
      ],
      events: [
        { title: "Low Tide release show", venue: "The Boathouse", address: "Pier 3", inDays: 5 },
        {
          title: "Harbor Lights live",
          venue: "Whelan's",
          address: "Wexford St, Dublin",
          inDays: 19,
        },
        {
          title: "A very long festival name: Summer Harbour Music and Arts Weekend",
          venue: "Cliffside Field Main Stage",
          address: "Cliff Road, Howth, County Dublin",
          inDays: 44,
        },
        { title: "Acoustic set", venue: "Library", inDays: 70 },
      ],
      collectibles: ["Low Tide VIP pass", "Signed tour poster", "Boathouse session ticket"],
    }));
  await addFollowers(full.id);
  await publish(
    full.id,
    layout.theme,
    layout.blocks.map((spec) => ({ ...spec, settings: { ...spec.settings } })),
  );
  console.log(`${FULL}: published the "${preset}" layout`);

  const sparse =
    (await db.organization.findUnique({ where: { slug: SPARSE } })) ??
    (await createArtist({
      slug: SPARSE,
      name: "The Extraordinarily Long-Named Orchestra of the Southern Harbours",
      bio: "",
      token: "ORCH",
      pictures: false,
      socials: false,
      albums: [{ title: "One", tracks: ["Only Song"] }],
      tiers: [{ name: "Friend", tokens: 1, features: [] }],
      events: [{ title: "Rehearsal", venue: "Hall", inDays: 3 }],
      collectibles: [],
    }));
  await addFollowers(sparse.id);
  await publish(sparse.id, LAYOUTS.full!.theme, SPARSE_BLOCKS);
  console.log(`${SPARSE}: published`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void db.$disconnect());
