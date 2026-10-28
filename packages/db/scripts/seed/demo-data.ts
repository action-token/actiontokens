/**
 * Demo content for the dev database. Everything here is invented; names are
 * deliberately fictional. Covers are placeholder photos and audio is the
 * royalty-free SoundHelix set, so players and cards have something real to load.
 */

export const cover = (seed: string, size = 800) => `https://picsum.photos/seed/bandcoin-${seed}/${size}/${size}`;
export const audio = (n: number) => `https://www.soundhelix.com/examples/mp3/SoundHelix-Song-${n}.mp3`;

export type DemoTrack = { title: string; durationSec: number; priceBandcoin: number; priceUsd: number; supply: number };
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
        { title: "Night Drive", durationSec: 211, priceBandcoin: 25000, priceUsd: 2.5, supply: 100 },
        { title: "Sunday Tape", durationSec: 178, priceBandcoin: 8000, priceUsd: 0.99, supply: 250 },
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
        { title: "Velvet Static", durationSec: 236, priceBandcoin: 18000, priceUsd: 1.99, supply: 100 },
        { title: "Slow Bloom", durationSec: 199, priceBandcoin: 12000, priceUsd: 1.49, supply: 150 },
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
        { title: "Circle Line", durationSec: 305, priceBandcoin: 12000, priceUsd: 1.29, supply: 200 },
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

export const ADMIN = { username: "admin", displayName: "Bandcoin Admin", email: "admin@demo.bandcoin.io" };

export const STUDIO_PACKAGES = [
  { name: "Starter", coins: 100, bonusCoins: 0, priceBandcoin: 20000, priceUsd: 2, sortOrder: 0 },
  { name: "Creator", coins: 500, bonusCoins: 50, priceBandcoin: 90000, priceUsd: 9, sortOrder: 1, isPopular: true },
  { name: "Studio", coins: 2000, bonusCoins: 400, priceBandcoin: 320000, priceUsd: 32, sortOrder: 2 },
];

/** Cost per generation type, in studio coins. */
export const STUDIO_PRICES = { TEXT: 1, IMAGE: 5, MUSIC: 20, VIDEO: 40, SEO: 2, SOCIAL: 2 };

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
