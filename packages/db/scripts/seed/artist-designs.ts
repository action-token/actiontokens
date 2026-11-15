/**
 * The designed artist pages for real artists (used by real-artists.ts for the dev
 * database and prod-layouts.ts for production). Facts here come from the artist's own
 * profile or a public source named beside them; nothing is invented for an artist the
 * web has nothing on.
 */

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export type Width = 1 | 2 | 3 | 4;
export type Block = {
  type: string;
  width: Width;
  hidden?: boolean;
  settings?: Record<string, unknown>;
};
export type Theme = { accent: string; fontPair: string; radius: string; density: string };
export type Design = { theme: Theme; blocks: (about: string, own: OwnContent) => Block[] };
/** Content the artist typed into their own published production page. */
export type OwnContent = {
  about?: string;
  videos?: unknown[];
  links?: unknown[];
  members?: unknown[];
  hidden: Set<string>;
};

/**
 * A page where every kind of block is present, so each one appears by itself the day the
 * artist has something to put in it (empty blocks are never shown to fans). Rows of
 * unfinished width are stretched to fill by the page itself.
 */
const complete = (extra: Partial<Record<string, Block>> = {}): Block[] =>
  [
    { type: "stories", width: 4 },
    { type: "music", width: 3, settings: { style: "list", count: 8 } },
    { type: "membership", width: 1 },
    { type: "releases", width: 4, settings: { style: "grid" } },
    { type: "highlights", width: 4 },
    { type: "nft-gallery", width: 4, settings: { style: "row" } },
    { type: "tour", width: 4, settings: { style: "list" } },
    { type: "about", width: 4 },
    { type: "videos", width: 4 },
    { type: "links", width: 4, settings: { style: "chips" } },
    { type: "band-members", width: 4 },
  ].map((block) => ({ ...block, ...extra[block.type] }) as Block);

export const DESIGN: Record<string, Design> = {
  // The only band the web knows well: Quad Cities melodic hard rock (their own profile;
  // The Cracks produced by Clint Lowery of Sevendust per their album text; Top Heatseekers
  // No. 23 in 2014 per Wikipedia and Qobuz). Songs and membership first, albums, then the
  // road: tour beside their videos, the story, and where to listen.
  "3-years-hollow": {
    theme: { accent: "#8F6318", fontPair: "grotesk", radius: "sm", density: "normal" },
    blocks: (_bio, own) => [
      { type: "stories", width: 4 },
      {
        type: "music",
        width: 3,
        settings: { style: "list", count: 8, heading: "Hits & new songs" },
      },
      { type: "membership", width: 1, settings: { heading: "Support the band" } },
      { type: "releases", width: 4, settings: { style: "grid", heading: "Albums" } },
      { type: "highlights", width: 4 },
      { type: "tour", width: 4, settings: { style: "tickets", count: 4, heading: "On tour" } },
      { type: "videos", width: 4, settings: { style: "grid", videos: own.videos ?? [] } },
      {
        type: "about",
        width: 4,
        settings: {
          style: "card",
          body: [
            own.about ?? "",
            "Their 2014 album The Cracks, produced by Clint Lowery of Sevendust, reached No. 23 on Billboard's Top Heatseekers chart.",
          ]
            .filter(Boolean)
            .join("\n"),
        },
      },
      { type: "links", width: 4, settings: { style: "chips", links: own.links ?? [] } },
      // They switched the lineup off on their own page, and the lineup found online is
      // dated, so it stays off until the band confirms it.
      {
        type: "band-members",
        width: 4,
        hidden: true,
        settings: { style: "cards", members: own.members ?? [] },
      },
    ],
  },
  // Lead vocalist of 3 Years Hollow (his own bio). The bio as a big quote, and a way to the band.
  hollowvox: {
    theme: { accent: "#8F6318", fontPair: "serif", radius: "sm", density: "spacious" },
    blocks: (bio) => [
      { type: "about", width: 4, settings: { style: "quote", body: bio } },
      ...complete({
        links: {
          type: "links",
          width: 4,
          settings: {
            style: "chips",
            links: [{ label: "3 Years Hollow", url: "https://www.3yearshollow.com/" }],
          },
        },
        about: { type: "about", width: 4, hidden: true },
      }).filter((block) => !(block.type === "about" && block.hidden)),
    ],
  },
  // Her own bio (electronic project born in the lockdown, three albums, a fourth on the way).
  "hillbilly-headspace": {
    theme: { accent: "#39ff88", fontPair: "grotesk", radius: "md", density: "normal" },
    blocks: (bio) => [
      { type: "about", width: 4, settings: { style: "quote", body: bio } },
      ...complete({ about: { type: "about", width: 4, hidden: true } }).filter(
        (block) => block.type !== "about",
      ),
    ],
  },
  // Nothing public about these on the web and no bio on the platform: the page carries no
  // words we'd have to invent. Only their pictures and, as they grow, music and tiers.
  tamethejester: {
    theme: { accent: "#7c3aed", fontPair: "serif", radius: "md", density: "normal" },
    blocks: (_bio, _own) => complete(),
  },
  instamix: {
    theme: { accent: "#ea580c", fontPair: "sans", radius: "md", density: "normal" },
    blocks: () => complete(),
  },
  "band-together": {
    theme: { accent: "#1d4ed8", fontPair: "grotesk", radius: "sm", density: "normal" },
    blocks: () => complete(),
  },
  "creator-hannah": {
    theme: { accent: "#ff5d73", fontPair: "sans", radius: "md", density: "normal" },
    blocks: () => complete(),
  },
};

/** What the artist typed into their own production page (about, videos, links, members). */
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
