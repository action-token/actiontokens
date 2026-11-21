import { z } from "zod";

import { safeUrl, videoEmbed } from "./links";

/**
 * The blocks an artist builds their page from. Each block has a type, a width
 * (in quarters of a row), two visibility switches and its own settings. A
 * block either shows data that already lives on Action Tokens (music, albums,
 * collectibles, membership tiers, events, stories) or content typed into its settings
 * (about, links, videos, band members).
 *
 * Saved pages are read leniently: an unknown block or a bad value is dropped
 * or repaired, never allowed to break the page for visitors.
 */
export const BLOCK_TYPES = [
  "cover",
  "about",
  "music",
  "releases",
  "nft-gallery",
  "membership",
  "tour",
  "links",
  "videos",
  "band-members",
  "stories",
  "highlights",
] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

/** 1 = a quarter of the row, 4 = the full row. */
export type BlockWidth = 1 | 2 | 3 | 4;
export const MAX_BLOCKS = 40;

const text = (max: number, fallback: string) =>
  z.string().trim().max(max).catch(fallback).default(fallback);
const count = (min: number, max: number, fallback: number) =>
  z.number().int().min(min).max(max).catch(fallback).default(fallback);

/** Keeps the valid items of a list (a bad one doesn't throw the rest away) up to `max`. */
const items = <T extends z.ZodType>(item: T, max: number) =>
  z
    .preprocess(
      (value: unknown) =>
        Array.isArray(value)
          ? (value as unknown[]).filter((entry) => item.safeParse(entry).success).slice(0, max)
          : [],
      z.array(item),
    )
    .default([]);

const webUrl = z
  .string()
  .refine((value) => safeUrl(value) !== null)
  .transform((value) => safeUrl(value)!);
const videoUrl = z
  .string()
  .refine((value) => videoEmbed(value) !== null)
  .transform((value) => safeUrl(value)!);
const optionalWebUrl = z.preprocess(
  (value) => (typeof value === "string" && safeUrl(value) ? safeUrl(value) : undefined),
  z.string().optional(),
);

/**
 * The ways a block can be laid out (its Style setting). The first is the default; a saved
 * page without a style, or with one that no longer exists, gets the default.
 */
export const BLOCK_STYLES = {
  about: [
    { value: "text", label: "Text" },
    { value: "quote", label: "Big quote" },
    { value: "card", label: "Photo card" },
  ],
  music: [
    { value: "list", label: "List" },
    { value: "cards", label: "Cards" },
  ],
  releases: [
    { value: "row", label: "Row" },
    { value: "grid", label: "Grid" },
  ],
  "nft-gallery": [
    { value: "grid", label: "Grid" },
    { value: "row", label: "Row" },
  ],
  tour: [
    { value: "list", label: "List" },
    { value: "tickets", label: "Ticket cards" },
  ],
  links: [
    { value: "buttons", label: "Buttons" },
    { value: "chips", label: "Chips" },
  ],
  videos: [
    { value: "grid", label: "Grid" },
    { value: "featured", label: "Featured" },
  ],
  "band-members": [
    { value: "circles", label: "Circles" },
    { value: "cards", label: "Cards" },
  ],
} as const satisfies Partial<Record<BlockType, readonly { value: string; label: string }[]>>;

export type StyledBlockType = keyof typeof BLOCK_STYLES;
export type StyleOf<T extends StyledBlockType> = (typeof BLOCK_STYLES)[T][number]["value"];

const styleSchema = <T extends StyledBlockType>(type: T) => {
  const values = BLOCK_STYLES[type].map((option) => option.value) as [StyleOf<T>, ...StyleOf<T>[]];
  return z.enum(values).catch(values[0]).default(values[0]);
};

/** A block's style, or its default when it has none (or the block has no styles). */
export function styleOf<T extends StyledBlockType>(
  block: { type: string; settings: Record<string, unknown> },
  type: T,
): StyleOf<T> {
  const options = BLOCK_STYLES[type] as readonly { value: string }[];
  const value = block.settings.style;
  return (
    options.some((option) => option.value === value) ? value : options[0]!.value
  ) as StyleOf<T>;
}

export const SETTINGS = {
  cover: z.object({ align: z.enum(["left", "center"]).catch("left").default("left") }),
  about: z.object({
    style: styleSchema("about"),
    heading: text(40, "About"),
    body: text(2000, ""),
  }),
  music: z.object({
    style: styleSchema("music"),
    heading: text(40, "Popular"),
    count: count(3, 10, 5),
  }),
  releases: z.object({
    style: styleSchema("releases"),
    heading: text(40, "Albums"),
    count: count(4, 12, 8),
  }),
  "nft-gallery": z.object({
    style: styleSchema("nft-gallery"),
    heading: text(40, "Collectibles"),
    count: count(4, 12, 8),
  }),
  membership: z.object({ heading: text(40, "Membership") }),
  tour: z.object({
    style: styleSchema("tour"),
    heading: text(40, "Tour dates"),
    count: count(1, 10, 5),
  }),
  links: z.object({
    style: styleSchema("links"),
    heading: text(40, "Links"),
    showSocials: z.boolean().catch(true).default(true),
    links: items(z.object({ label: z.string().trim().min(1).max(40), url: webUrl }), 12),
  }),
  videos: z.object({
    style: styleSchema("videos"),
    heading: text(40, "Videos"),
    videos: items(
      z.object({ title: z.string().trim().max(80).catch("").default(""), url: videoUrl }),
      8,
    ),
  }),
  "band-members": z.object({
    style: styleSchema("band-members"),
    heading: text(40, "Band members"),
    members: items(
      z.object({
        name: z.string().trim().min(1).max(60),
        role: z.string().trim().max(60).catch("").default(""),
        photoUrl: optionalWebUrl,
      }),
      12,
    ),
  }),
  // Both show what the artist already shared as stories; there is nothing to set but a heading.
  stories: z.object({ heading: text(40, "Stories") }),
  highlights: z.object({ heading: text(40, "Highlights") }),
} satisfies Record<BlockType, z.ZodType>;

export type SettingsOf<T extends BlockType> = z.infer<(typeof SETTINGS)[T]>;

export type Block = {
  uid: string;
  type: BlockType;
  width: BlockWidth;
  hidden: boolean;
  /** For data blocks: skip it until it has something to show */
  hideWhenEmpty: boolean;
  settings: Record<string, unknown>;
};

// ── What the editor needs to know about each block ─────────────────────────

export type FieldKind = "text" | "textarea" | "toggle" | "select" | "number" | "list" | "image";
export type FieldDef = {
  key: string;
  kind: FieldKind;
  label: string;
  help?: string;
  max?: number;
  min?: number;
  options?: { value: string; label: string }[];
  /** For `list`: the fields of each row */
  fields?: FieldDef[];
  addLabel?: string;
  /** For `list`: which row field names the row in the list */
  titleKey?: string;
};

export type BlockCategory = "essentials" | "music" | "sell" | "connect";

export type BlockDef = {
  type: BlockType;
  label: string;
  description: string;
  category: BlockCategory;
  defaultWidth: BlockWidth;
  defaultHideWhenEmpty: boolean;
  /** "data" blocks show what's already on Action Tokens; "settings" blocks hold what the artist types */
  source: "data" | "settings";
  /** Every page has exactly one, and it can't be removed (the cover) */
  locked?: boolean;
  fields: FieldDef[];
  /** Shown instead of an empty block while editing */
  empty: string;
};

const heading = (max = 40): FieldDef => ({ key: "heading", kind: "text", label: "Heading", max });
/** The Style choice, shown first in a block's settings. */
const style = (type: StyledBlockType): FieldDef => ({
  key: "style",
  kind: "select",
  label: "Style",
  options: BLOCK_STYLES[type].map((option) => ({ value: option.value, label: option.label })),
});

export const BLOCK_DEFS: Record<BlockType, BlockDef> = {
  cover: {
    type: "cover",
    label: "Cover & profile",
    description: "Cover image, photo, name, bio and follow button.",
    category: "essentials",
    defaultWidth: 4,
    defaultHideWhenEmpty: false,
    source: "data",
    locked: true,
    fields: [
      {
        key: "align",
        kind: "select",
        label: "Alignment",
        options: [
          { value: "left", label: "Left" },
          { value: "center", label: "Centered" },
        ],
      },
    ],
    empty: "",
  },
  about: {
    type: "about",
    label: "About",
    description: "A longer bio.",
    category: "essentials",
    defaultWidth: 2,
    defaultHideWhenEmpty: false,
    source: "settings",
    fields: [
      style("about"),
      heading(),
      { key: "body", kind: "textarea", label: "Text", max: 2000 },
    ],
    empty: "Add a few words about yourself",
  },
  music: {
    type: "music",
    label: "Popular songs",
    description: "Your most played songs, with a play button.",
    category: "music",
    defaultWidth: 2,
    defaultHideWhenEmpty: true,
    source: "data",
    fields: [
      style("music"),
      heading(),
      { key: "count", kind: "number", label: "How many", min: 3, max: 10 },
    ],
    empty: "Your songs show here once you release one",
  },
  releases: {
    type: "releases",
    label: "Albums",
    description: "Your albums and EPs.",
    category: "music",
    defaultWidth: 4,
    defaultHideWhenEmpty: true,
    source: "data",
    fields: [
      style("releases"),
      heading(),
      { key: "count", kind: "number", label: "How many", min: 4, max: 12 },
    ],
    empty: "Your albums show here once you create one",
  },
  "nft-gallery": {
    type: "nft-gallery",
    label: "Collectibles",
    description: "Collectibles and drops you have for sale.",
    category: "sell",
    defaultWidth: 4,
    defaultHideWhenEmpty: true,
    source: "data",
    fields: [
      style("nft-gallery"),
      heading(),
      { key: "count", kind: "number", label: "How many", min: 4, max: 12 },
    ],
    empty: "Your collectibles show here once one is for sale",
  },
  membership: {
    type: "membership",
    label: "Membership tiers",
    description: "The tiers fans unlock by holding your fan token.",
    category: "sell",
    defaultWidth: 4,
    defaultHideWhenEmpty: true,
    source: "data",
    fields: [heading()],
    empty: "Your tiers show here once you add one",
  },
  tour: {
    type: "tour",
    label: "Tour dates",
    description: "Your upcoming events, with RSVP.",
    category: "connect",
    defaultWidth: 2,
    defaultHideWhenEmpty: true,
    source: "data",
    fields: [
      style("tour"),
      heading(),
      { key: "count", kind: "number", label: "How many", min: 1, max: 10 },
    ],
    empty: "Your upcoming events show here",
  },
  links: {
    type: "links",
    label: "Links",
    description: "Buttons to anywhere, plus your socials.",
    category: "connect",
    defaultWidth: 1,
    defaultHideWhenEmpty: false,
    source: "settings",
    fields: [
      style("links"),
      heading(),
      { key: "showSocials", kind: "toggle", label: "Show my website and social links" },
      {
        key: "links",
        kind: "list",
        label: "Links",
        addLabel: "Add link",
        titleKey: "label",
        fields: [
          { key: "label", kind: "text", label: "Label", max: 40 },
          { key: "url", kind: "text", label: "Address", help: "Starts with https://" },
        ],
      },
    ],
    empty: "Add a link",
  },
  videos: {
    type: "videos",
    label: "Videos",
    description: "YouTube or Vimeo videos.",
    category: "music",
    defaultWidth: 2,
    defaultHideWhenEmpty: true,
    source: "settings",
    fields: [
      style("videos"),
      heading(),
      {
        key: "videos",
        kind: "list",
        label: "Videos",
        addLabel: "Add video",
        titleKey: "title",
        fields: [
          { key: "title", kind: "text", label: "Title", max: 80 },
          {
            key: "url",
            kind: "text",
            label: "YouTube or Vimeo address",
            help: "Starts with https://",
          },
        ],
      },
    ],
    empty: "Add a video link",
  },
  "band-members": {
    type: "band-members",
    label: "Band members",
    description: "Who is in the band.",
    category: "connect",
    defaultWidth: 2,
    defaultHideWhenEmpty: true,
    source: "settings",
    fields: [
      style("band-members"),
      heading(),
      {
        key: "members",
        kind: "list",
        label: "Members",
        addLabel: "Add member",
        titleKey: "name",
        fields: [
          { key: "name", kind: "text", label: "Name", max: 60 },
          { key: "role", kind: "text", label: "Role", max: 60 },
          { key: "photoUrl", kind: "image", label: "Photo" },
        ],
      },
    ],
    empty: "Add a band member",
  },
  stories: {
    type: "stories",
    label: "Stories",
    description: "Your live stories, gone in 24 hours. Fans tap one to watch.",
    category: "connect",
    defaultWidth: 4,
    defaultHideWhenEmpty: true,
    source: "data",
    fields: [heading()],
    empty: "Your stories show here while one is live",
  },
  highlights: {
    type: "highlights",
    label: "Highlights",
    description: "Everything you have shared, newest first.",
    category: "connect",
    defaultWidth: 4,
    defaultHideWhenEmpty: true,
    source: "data",
    fields: [heading()],
    empty: "Your highlights show here once you have shared a story",
  },
};

export const BLOCK_LIST: BlockDef[] = BLOCK_TYPES.map((type) => BLOCK_DEFS[type]);

/** A fresh block with its defaults, for "add block". */
export function makeBlock(type: BlockType, uid: string): Block {
  const def = BLOCK_DEFS[type];
  return {
    uid,
    type,
    width: def.defaultWidth,
    hidden: false,
    hideWhenEmpty: def.defaultHideWhenEmpty,
    settings: SETTINGS[type].parse({}),
  };
}

const isWidth = (value: unknown): value is BlockWidth =>
  value === 1 || value === 2 || value === 3 || value === 4;

/** One block from anything: unknown types are dropped, bad settings are repaired. */
export function parseBlock(raw: unknown): Block | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const type = BLOCK_TYPES.find((entry) => entry === value.type);
  if (!type || typeof value.uid !== "string" || value.uid.length === 0 || value.uid.length > 64)
    return null;
  const def = BLOCK_DEFS[type];
  return {
    uid: value.uid,
    type,
    width: isWidth(value.width) ? value.width : def.defaultWidth,
    hidden: value.hidden === true,
    hideWhenEmpty:
      typeof value.hideWhenEmpty === "boolean" ? value.hideWhenEmpty : def.defaultHideWhenEmpty,
    settings: SETTINGS[type].parse(
      value.settings && typeof value.settings === "object" ? value.settings : {},
    ),
  };
}

/**
 * A whole page from anything saved. Repairs it so it always has exactly one
 * cover, first and full width, no repeated ids and at most MAX_BLOCKS blocks.
 */
export function normalizeBlocks(
  raw: unknown,
  newUid: () => string = () => `b-${Math.random().toString(36).slice(2, 10)}`,
): Block[] {
  const seen = new Set<string>();
  const parsed = (Array.isArray(raw) ? raw : []).flatMap((entry) => {
    const block = parseBlock(entry);
    if (!block || seen.has(block.uid)) return [];
    seen.add(block.uid);
    return [block];
  });
  const cover = parsed.find((block) => block.type === "cover") ?? makeBlock("cover", newUid());
  const rest = parsed.filter((block) => block.type !== "cover").slice(0, MAX_BLOCKS - 1);
  return [{ ...cover, width: 4, hidden: false }, ...rest];
}
