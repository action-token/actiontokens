/**
 * Builds an artist's page from what the artist actually has (used by real-artists.ts for the
 * dev database and prod-layouts.ts for production). The same facts always give the same page.
 *
 * Every block type is present, in an order that reads well, so each one appears by itself the
 * day the artist has something to put in it (a block with nothing in it is never shown to fans,
 * and the page stretches the rest to fill their rows). What changes with the data is the style,
 * the count, the heading and which words the page carries:
 *   - songs:        a few songs are covers, many are a list; as many shown as they have (up to 8)
 *   - collectibles: a grid when few, a scrolling row when many (songs are not collectibles)
 *   - tour:         ticket cards when few, a list when many
 *   - about:        their own bio only (never invented): a photo card, a pull quote or plain text
 *   - links:        their own links and socials; videos and lineup as they typed them
 * An artist with no songs, albums or collectibles but a real bio gets that bio first.
 *
 * Facts about an artist beyond what their profile says (META below) come from a public source
 * named beside them; nothing is invented for an artist the web has nothing on.
 */

export type Width = 1 | 2 | 3 | 4;
export type Block = {
  type: string;
  width: Width;
  hidden?: boolean;
  settings?: Record<string, unknown>;
};
export type Theme = { accent: string; fontPair: string; radius: string; density: string };

/** Content the artist typed into their own published page. */
export type OwnContent = {
  about?: string;
  videos?: unknown[];
  links?: unknown[];
  members?: unknown[];
  hidden: Set<string>;
};

/** What a page is built from. */
export type Facts = {
  slug: string;
  name: string;
  /** Their bio, only when it is a real one (not a placeholder, their own name or a link) */
  bio: string;
  hasPhoto: boolean;
  hasCover: boolean;
  tracks: number;
  /** For sale, and not a song */
  collectibles: number;
  albums: number;
  tiers: number;
  /** Upcoming only */
  events: number;
  own: OwnContent;
};

/** Per-artist choices that facts alone can't make. */
type Meta = {
  theme?: Theme;
  /** Added under their own About text */
  aboutExtra?: string;
  /** Appended to their own links */
  links?: { label: string; url: string }[];
  /** Per block type: settings that win over the generated ones */
  settings?: Partial<Record<string, Record<string, unknown>>>;
  /** Blocks to switch off */
  hide?: string[];
};

export const META: Record<string, Meta> = {
  // Quad Cities melodic hard rock (their own profile; The Cracks produced by Clint Lowery of
  // Sevendust per their album text; Top Heatseekers No. 23 in 2014 per Wikipedia and Qobuz).
  "3-years-hollow": {
    theme: { accent: "#8F6318", fontPair: "grotesk", radius: "sm", density: "normal" },
    aboutExtra:
      "Their 2014 album The Cracks, produced by Clint Lowery of Sevendust, reached No. 23 on Billboard's Top Heatseekers chart.",
    settings: {
      music: { heading: "Hits & new songs" },
      membership: { heading: "Support the band" },
      tour: { style: "tickets", count: 4, heading: "On tour" },
      videos: { style: "grid" },
      // They switched the lineup off on their own page, and the lineup found online is
      // dated, so it stays off until the band confirms it.
      "band-members": { style: "cards" },
    },
    hide: ["band-members"],
  },
  // Lead vocalist of 3 Years Hollow (his own bio): the bio as a pull quote, a way to the band.
  hollowvox: {
    theme: { accent: "#8F6318", fontPair: "serif", radius: "sm", density: "spacious" },
    links: [{ label: "3 Years Hollow", url: "https://www.3yearshollow.com/" }],
    settings: { about: { style: "quote" } },
  },
};

const ACCENTS = ["#7c3aed", "#ea580c", "#1d4ed8", "#ff5d73", "#39ff88", "#0f766e", "#c026d3"];
const FONTS = ["grotesk", "serif", "sans"];

const hash = (text: string) =>
  [...text].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 7);

/** A look of their own, the same every time for the same artist. */
export function themeFor(slug: string): Theme {
  const n = hash(slug);
  return {
    accent: ACCENTS[n % ACCENTS.length]!,
    fontPair: FONTS[n % FONTS.length]!,
    radius: n % 2 ? "md" : "sm",
    density: "normal",
  };
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** The artist's blocks, cover excluded (the cover is always first and added by the saver). */
export function buildBlocks(facts: Facts): { theme: Theme; blocks: Block[] } {
  const meta = META[facts.slug] ?? {};
  const { own } = facts;
  const about = [own.about ?? facts.bio, meta.aboutExtra].filter(Boolean).join("\n");
  const aboutStyle =
    about.length >= 300
      ? facts.hasPhoto
        ? "card"
        : "text"
      : facts.hasPhoto && about.length >= 100
        ? "card"
        : "quote";
  const links = [...(Array.isArray(own.links) ? own.links : []), ...(meta.links ?? [])];
  const withMusic = facts.tracks > 0 || facts.albums > 0 || facts.collectibles > 0;

  const aboutBlock: Block = {
    type: "about",
    width: 4,
    settings: { style: aboutStyle, body: about },
  };
  const blocks: Block[] = [
    { type: "stories", width: 4 },
    // Someone with nothing to sell yet leads with who they are.
    ...(withMusic ? [] : [aboutBlock]),
    {
      type: "music",
      width: facts.tiers > 0 ? 3 : 4,
      settings: {
        style: facts.tracks > 0 && facts.tracks <= 3 ? "cards" : "list",
        count: clamp(facts.tracks, 3, 8),
      },
    },
    { type: "membership", width: facts.tracks > 0 ? 1 : 4 },
    {
      type: "releases",
      width: 4,
      settings: { style: "grid", count: clamp(facts.albums, 4, 12) },
    },
    { type: "highlights", width: 4 },
    {
      type: "nft-gallery",
      width: 4,
      settings: {
        style: facts.collectibles > 4 ? "row" : "grid",
        count: clamp(facts.collectibles, 4, 12),
      },
    },
    {
      type: "tour",
      width: 4,
      settings: {
        style: facts.events > 0 && facts.events <= 4 ? "tickets" : "list",
        count: clamp(facts.events, 1, 6),
      },
    },
    { type: "videos", width: 4, settings: { style: "grid", videos: own.videos ?? [] } },
    ...(withMusic ? [aboutBlock] : []),
    { type: "links", width: 4, settings: { style: "chips", links } },
    { type: "band-members", width: 4, settings: { members: own.members ?? [] } },
  ];

  return {
    theme: meta.theme ?? themeFor(facts.slug),
    blocks: blocks.map((block) => ({
      ...block,
      hidden: (meta.hide ?? []).includes(block.type),
      settings: { ...block.settings, ...meta.settings?.[block.type] },
    })),
  };
}

/** The saved page: the cover, then the blocks, in the shape the page editor stores. */
export function pageJson(facts: Facts) {
  const { theme, blocks } = buildBlocks(facts);
  const all = [
    { uid: "cover", type: "cover", width: 4, hidden: false, settings: { align: "left" } },
    ...blocks.map((block, i) => ({
      uid: `b-${i + 1}`,
      type: block.type,
      width: block.width,
      hidden: block.hidden ?? false,
      settings: block.settings ?? {},
    })),
  ];
  return { theme, blocks: all };
}

// ---------------------------------------------------------------------------------------------
// Facts from production rows (the shapes prod-read.ts returns)

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** What the artist typed into their own published page (about, videos, links, members). */
export function ownContent(raw: unknown): OwnContent {
  const blocks: Row[] = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as Row | null)?.blocks)
      ? (raw as Row).blocks
      : [];
  const settings = (type: string) => blocks.find((block) => block.type === type)?.settings ?? {};
  return {
    about: typeof settings("about").body === "string" ? settings("about").body : undefined,
    videos: settings("videos").videos,
    links: settings("links").links,
    members: settings("band-members").members,
    hidden: new Set(blocks.filter((block) => block.hidden).map((block) => String(block.type))),
  };
}

/** A bio worth showing: not a placeholder, not just their name, not a bare link. */
export function realBio(name: string, bio: unknown): string {
  const text = typeof bio === "string" ? bio.trim() : "";
  if (text.length < 25 || /^https?:\/\//i.test(text) || text === "Bio not available.") return "";
  if (text.toLowerCase().includes(`account for`) && text.length < 40) return "";
  return text === name ? "" : text;
}

export function factsFrom(data: {
  artist: Row;
  layout?: unknown;
  albums: Row[];
  tiers: Row[];
  events: Row[];
  items: Row[];
}): Facts {
  const { artist } = data;
  const now = Date.now();
  return {
    slug: artist.slug,
    name: artist.name,
    bio: realBio(artist.name, artist.bio),
    hasPhoto: Boolean(artist.coverUrl ?? artist.avatarUrl),
    hasCover: Boolean(artist.coverUrl),
    tracks: data.items.filter((item) => item.type === "TRACK").length,
    collectibles: data.items.filter(
      (item) => item.type !== "TRACK" && item.type !== "FAN_TOKEN" && item.priceBandcoin != null,
    ).length,
    albums: data.albums.length,
    tiers: data.tiers.filter((tier) => tier.isActive !== false).length,
    events: data.events.filter((event) => new Date(event.endsAt).getTime() >= now).length,
    own: ownContent(data.layout),
  };
}

/** Whether there is enough to design a page around (a stub account with nothing is left alone). */
export const hasSubstance = (facts: Facts, hasOwnPage: boolean) =>
  hasOwnPage ||
  facts.hasPhoto ||
  Boolean(facts.bio) ||
  facts.tracks + facts.collectibles + facts.albums + facts.tiers + facts.events > 0;
