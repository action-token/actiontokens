/**
 * Demo content for the dev database. Everything here is invented; names are
 * deliberately fictional. Covers are generated placeholder art kept in our own bucket
 * (testnet/shared/demo/, so dev never depends on an outside photo site) and audio is the
 * royalty-free SoundHelix set, so players and cards have something real to load.
 */
import { createHash } from "node:crypto";

/** Where the demo art lives. Override with DEMO_ASSET_BASE to serve it from somewhere else. */
const DEMO_ASSET_BASE =
  process.env.DEMO_ASSET_BASE ?? "https://bandcoin.s3.us-west-2.amazonaws.com/testnet/shared/demo";
const SQUARE_COUNT = 12;
const BANNER_COUNT = 6;

/** The same seed always gets the same picture (1..count). */
const pick = (seed: string, count: number) =>
  String((createHash("sha1").update(seed).digest().readUInt32BE(0) % count) + 1).padStart(2, "0");

/** A square demo cover. `size` is kept so callers read the same; the picture scales in the page. */
export const cover = (seed: string, _size = 800) =>
  `${DEMO_ASSET_BASE}/cover-${pick(`bandcoin-${seed}`, SQUARE_COUNT)}.jpg`;
/** A wide demo banner. */
export const banner = (seed: string) =>
  `${DEMO_ASSET_BASE}/banner-${pick(`bandcoin-${seed}`, BANNER_COUNT)}.jpg`;
export const audio = (n: number) =>
  `https://www.soundhelix.com/examples/mp3/SoundHelix-Song-${n}.mp3`;

export type DemoTrack = {
  title: string;
  durationSec: number;
  priceBandcoin: number;
  priceUsd: number;
  supply: number;
};
export type DemoArtist = {
  slug: string;
  name: string;
  email: string;
  bio: string;
  fanToken: string;
  city: { lat: number; lng: number; name: string };
  album: { title: string; tracks: DemoTrack[] };
};

export const ARTISTS: DemoArtist[] = [
  {
    slug: "lumen-avenue",
    name: "Lumen Avenue",
    email: "lumen@demo.bandcoin.io",
    bio: "Night-drive synth pop from a two-piece who record everything in one take.",
    fanToken: "LUMEN",
    city: { lat: 40.7128, lng: -74.006, name: "New York" },
    album: {
      title: "Night Drive",
      tracks: [
        {
          title: "Night Drive",
          durationSec: 211,
          priceBandcoin: 25000,
          priceUsd: 2.5,
          supply: 100,
        },
        {
          title: "Sunday Tape",
          durationSec: 178,
          priceBandcoin: 8000,
          priceUsd: 0.99,
          supply: 250,
        },
        { title: "Glass Harbour", durationSec: 252, priceBandcoin: 30000, priceUsd: 3, supply: 50 },
      ],
    },
  },
  {
    slug: "mira-okafor",
    name: "Mira Okafor",
    email: "mira@demo.bandcoin.io",
    bio: "Afro-soul singer and producer. Every holder gets the stems.",
    fanToken: "MIRA",
    city: { lat: 51.5072, lng: -0.1276, name: "London" },
    album: {
      title: "Velvet Static",
      tracks: [
        {
          title: "Velvet Static",
          durationSec: 236,
          priceBandcoin: 18000,
          priceUsd: 1.99,
          supply: 100,
        },
        {
          title: "Slow Bloom",
          durationSec: 199,
          priceBandcoin: 12000,
          priceUsd: 1.49,
          supply: 150,
        },
        { title: "Gold Hour", durationSec: 224, priceBandcoin: 15000, priceUsd: 1.79, supply: 120 },
      ],
    },
  },
  {
    slug: "dj-tamsin",
    name: "DJ Tamsin",
    email: "tamsin@demo.bandcoin.io",
    bio: "Club edits and late-night mixes. Find me on the map after every set.",
    fanToken: "TAMSIN",
    city: { lat: 23.8103, lng: 90.4125, name: "Dhaka" },
    album: {
      title: "Circle Line",
      tracks: [
        {
          title: "Circle Line",
          durationSec: 305,
          priceBandcoin: 12000,
          priceUsd: 1.29,
          supply: 200,
        },
        { title: "Green Room", durationSec: 274, priceBandcoin: 9500, priceUsd: 0.99, supply: 300 },
      ],
    },
  },
];

export const FANS = [
  { username: "nadia", displayName: "Nadia Rahman", email: "nadia@demo.bandcoin.io" },
  { username: "theo", displayName: "Theo Marsh", email: "theo@demo.bandcoin.io" },
  { username: "kenji", displayName: "Kenji Ito", email: "kenji@demo.bandcoin.io" },
  { username: "ama", displayName: "Ama Boateng", email: "ama@demo.bandcoin.io" },
];

export const ADMIN = {
  username: "admin",
  displayName: "Bandcoin Admin",
  email: "admin@demo.bandcoin.io",
};

/** Coin packages: priced in dollars, one coin a cent, plus bonus coins (BANDCOIN follows the live rate). */
export const STUDIO_PACKAGES = [
  { name: "Starter", coins: 200, bonusCoins: 0, priceBandcoin: 0, priceUsd: 2, sortOrder: 0 },
  {
    name: "Creator",
    coins: 900,
    bonusCoins: 100,
    priceBandcoin: 0,
    priceUsd: 9,
    sortOrder: 1,
    isPopular: true,
  },
  { name: "Studio", coins: 3000, bonusCoins: 500, priceBandcoin: 0, priceUsd: 30, sortOrder: 2 },
];

/**
 * The platform fee on top of the AI provider's costs (see api services/studio/
 * pricing). Each model's cost comes from the model catalog until an admin sets
 * it; music's are listed here.
 */
export const STUDIO_PRICES = {
  feePercent: 30,
  apiCostUsd: { MUSIC_CLIP: 0.04, MUSIC_SONG: 0.08, MUSIC_LIVE: 0.05 },
};

/** A small offset in metres → degrees, to scatter pins around a city centre. */
export function nudge(lat: number, lng: number, northM: number, eastM: number) {
  return {
    latitude: lat + northM / 111_320,
    longitude: lng + eastM / (111_320 * Math.cos((lat * Math.PI) / 180)),
  };
}

/**
 * Real accounts (not demo). Only public addresses here, never secret keys.
 * Signing in with this wallet opens the artist portal as this artist.
 */
export const REAL_ARTISTS = [
  {
    slug: "fyron-alias",
    name: "Fyron Alias",
    walletAddress: "GCMTJCWDCE6AVBJMFCYIIPSLISCOTG3W62MMYKQOWBC2M4SJ65DEMUYK",
  },
];

/** A listening bounty: play every song on the album twice to qualify. */
export const musicBounty = (artistId: string, demo: DemoArtist) => ({
  artistId,
  title: `Stream ${demo.album.title}`,
  summary: `Play ${demo.album.title} and win BANDCOIN.`,
  description: `Listen to every song on ${demo.album.title} twice. Three listeners who finish share the prize.`,
  instructions: ["Connect Last.fm", "Play each song twice", "Your progress updates as you listen"],
  prizeCurrency: "BANDCOIN" as const,
  prizeAmount: 30000,
  maxWinners: 3,
  escrowContractId: `demo-escrow-${demo.slug}-music`,
  fundTxHash: `demo-fund-${demo.slug}-music`,
  musicRule: {
    create: {
      mode: "MUSIC_ONLY" as const,
      ruleType: "ALL" as const,
      tracks: {
        create: demo.album.tracks.map((track) => ({
          title: track.title,
          artistName: demo.name,
          albumName: demo.album.title,
          durationSec: track.durationSec,
          targetPlays: 2,
          lastFmUrl: `https://www.last.fm/music/${encodeURIComponent(demo.name)}/_/${encodeURIComponent(track.title)}`,
        })),
      },
    },
  },
});
