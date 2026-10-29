import type { Block, BlockType } from "@bandcoin/page/blocks";

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
  }
}

/**
 * The blocks to draw. Visitors never see a hidden block, and an empty block is
 * either dropped (hide when empty) or shown with a quiet "nothing yet" line.
 * While editing, everything is drawn so the artist can still select it.
 */
export function blocksToShow(
  blocks: Block[],
  artist: ArtistPageData,
  editing: boolean,
): { block: Block; empty: boolean }[] {
  return blocks
    .filter((block) => editing || !block.hidden)
    .map((block) => ({ block, empty: isBlockEmpty(block, artist) }))
    .filter(({ block, empty }) => editing || !(empty && block.hideWhenEmpty));
}
