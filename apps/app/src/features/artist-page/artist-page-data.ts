import type { Block, BlockType, BlockWidth } from "@bandcoin/page/blocks";

import type { RouterOutputs } from "~/trpc/react";

/** Everything the blocks can show about an artist, from one query (artist.bySlug). */
export type ArtistPageData = RouterOutputs["artist"]["bySlug"];

/** What a visitor sees in place of a block that has nothing to show, when the artist chose not to hide it. */
export const EMPTY_TEXT: Record<BlockType, string> = {
  cover: "",
  about: "No bio yet.",
  music: "No songs yet.",
  releases: "No albums yet.",
  "nft-gallery": "Nothing for sale right now.",
  membership: "No membership tiers yet.",
  tour: "No upcoming events.",
  links: "No links yet.",
  videos: "No videos yet.",
  "band-members": "No members listed yet.",
  stories: "No live stories.",
  highlights: "No highlights yet.",
};

type Socials = Pick<ArtistPageData, "website" | "twitter" | "instagram">;

/** The artist's own website and social accounts as buttons. */
export function socialLinks(artist: Socials): { label: string; href: string }[] {
  const handle = (value: string) => value.replace(/^@/, "").trim();
  return [
    artist.website ? { label: "Website", href: artist.website } : null,
    artist.instagram
      ? { label: "Instagram", href: `https://instagram.com/${handle(artist.instagram)}` }
      : null,
    artist.twitter ? { label: "X", href: `https://x.com/${handle(artist.twitter)}` } : null,
  ].filter((link): link is { label: string; href: string } => link !== null);
}

/** Whether a block would show nothing right now. The cover is never empty. */
export function isBlockEmpty(block: Block, artist: ArtistPageData): boolean {
  const list = (key: string) =>
    Array.isArray(block.settings[key]) ? (block.settings[key] as unknown[]) : [];
  switch (block.type) {
    case "cover":
      return false;
    case "about":
      return typeof block.settings.body !== "string" || block.settings.body.trim().length === 0;
    case "music":
      return artist.popular.length === 0;
    case "releases":
      return artist.albums.length === 0;
    case "nft-gallery":
      return artist.forSale.length === 0;
    case "membership":
      return artist.tiers.length === 0;
    case "tour":
      return artist.events.length === 0;
    case "links":
      return (
        list("links").length === 0 &&
        !(block.settings.showSocials !== false && socialLinks(artist).length > 0)
      );
    case "videos":
      return list("videos").length === 0;
    case "band-members":
      return list("members").length === 0;
    // Their stories load in the browser: the block draws nothing for a fan while it has none.
    case "stories":
    case "highlights":
      return false;
  }
}

/**
 * The blocks to draw. Visitors never see a hidden block or an empty one (a block with
 * nothing to show waits until it has something). While editing, everything is drawn so
 * the artist can still select it; empty ones say what will fill them.
 */
export function blocksToShow(
  blocks: Block[],
  artist: ArtistPageData,
  editing: boolean,
): { block: Block; empty: boolean }[] {
  return blocks
    .filter((block) => editing || !block.hidden)
    .map((block) => ({ block, empty: isBlockEmpty(block, artist) }))
    .filter(({ empty }) => editing || !empty);
}

/**
 * The columns each block really spans: a block that leaves its row unfinished (the
 * next one doesn't fit beside it, or it is the last) stretches to the end of the row,
 * so the page never shows a hole. Widths the artist picked still decide what sits together.
 */
export function rowSpans(widths: BlockWidth[]): BlockWidth[] {
  const spans = [...widths];
  let used = 0;
  let rowEnd = -1; // index of the last block in the current row
  widths.forEach((width, index) => {
    if (used > 0 && used + width > 4) {
      spans[rowEnd] = (spans[rowEnd]! + (4 - used)) as BlockWidth;
      used = 0;
    }
    used += width;
    rowEnd = index;
    if (used === 4) used = 0;
  });
  if (used > 0 && rowEnd >= 0) spans[rowEnd] = (spans[rowEnd]! + (4 - used)) as BlockWidth;
  return spans;
}
