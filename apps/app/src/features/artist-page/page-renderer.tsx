"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

import type { Block, BlockType, BlockWidth } from "@bandcoin/page/blocks";
import { BLOCK_DEFS } from "@bandcoin/page/blocks";
import { type PageTheme, themeVars } from "@bandcoin/page/theme";
import { cn } from "@bandcoin/ui/lib/cn";

import { blocksToShow, type ArtistPageData } from "./artist-page-data";
import {
  CollectiblesBlock,
  MembershipBlock,
  MusicBlock,
  ReleasesBlock,
  TourBlock,
} from "./blocks/catalog";
import { AboutBlock, BandMembersBlock, LinksBlock, VideosBlock } from "./blocks/story";
import { CoverBanner } from "./cover-banner";

/** Columns a block spans on a wide screen (everything is full width on a phone). */
const SPAN: Record<BlockWidth, string> = {
  1: "md:col-span-1",
  2: "md:col-span-2",
  3: "md:col-span-3",
  4: "md:col-span-4",
};

const FONT: Record<PageTheme["fontPair"], string> = {
  grotesk: "",
  sans: "font-sans",
  serif: "font-serif",
};

function BlockView({
  block,
  artist,
  empty,
}: {
  block: Block;
  artist: ArtistPageData;
  empty: boolean;
}) {
  switch (block.type satisfies BlockType) {
    case "cover":
      return (
        <CoverBanner
          artist={artist}
          align={block.settings.align === "center" ? "center" : "left"}
        />
      );
    case "about":
      return <AboutBlock block={block} empty={empty} />;
    case "music":
      return <MusicBlock block={block} artist={artist} empty={empty} />;
    case "releases":
      return <ReleasesBlock block={block} artist={artist} empty={empty} />;
    case "nft-gallery":
      return <CollectiblesBlock block={block} artist={artist} empty={empty} />;
    case "membership":
      return <MembershipBlock block={block} artist={artist} empty={empty} />;
    case "tour":
      return <TourBlock block={block} artist={artist} empty={empty} />;
    case "links":
      return <LinksBlock block={block} artist={artist} empty={empty} />;
    case "videos":
      return <VideosBlock block={block} empty={empty} />;
    case "band-members":
      return <BandMembersBlock block={block} empty={empty} />;
  }
}

/** One broken block must not take the whole page down. */
class BlockBoundary extends Component<{ children: ReactNode; label: string }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("[artist page block]", this.props.label, error, info.componentStack);
  }
  override render() {
    return this.state.failed ? (
      <p className="text-fg-muted rounded-lg border border-dashed p-4 text-center text-xs">
        This section couldn&apos;t be loaded.
      </p>
    ) : (
      this.props.children
    );
  }
}

/**
 * An artist's page: their blocks in a four-column grid, in their theme. Used by
 * the public page and by the page builder's live preview (`editing`), where
 * every block can be selected and hidden or empty ones are shown dimmed.
 */
export function PageRenderer({
  blocks,
  theme,
  artist,
  editing = false,
  selectedUid,
  onSelect,
}: {
  blocks: Block[];
  theme: PageTheme;
  artist: ArtistPageData;
  editing?: boolean;
  selectedUid?: string | null;
  onSelect?: (uid: string) => void;
}) {
  return (
    <div
      className={cn("artist-page w-full", FONT[theme.fontPair])}
      style={{
        ...themeVars(theme),
        fontFamily: theme.fontPair === "grotesk" ? undefined : "var(--page-font)",
      }}
    >
      <div className="grid w-full max-w-[var(--page-max,96rem)] grid-cols-1 gap-[var(--page-gap)] px-4 py-6 sm:px-8 md:grid-cols-4">
        {blocksToShow(blocks, artist, editing).map(({ block, empty }) => (
          <div
            key={block.uid}
            data-block-uid={block.uid}
            data-block-type={block.type}
            className={cn(
              SPAN[block.width],
              "min-w-0",
              block.type === "cover" && "md:col-span-4",
              editing &&
                "cursor-pointer rounded-[var(--page-radius)] outline-2 outline-offset-4 transition-[outline-color]",
              editing &&
                (selectedUid === block.uid
                  ? "outline-[var(--page-accent)]"
                  : "outline-transparent hover:outline-[color-mix(in_srgb,var(--page-accent)_45%,transparent)]"),
              editing && (block.hidden || empty) && "opacity-50",
            )}
            onClick={editing ? () => onSelect?.(block.uid) : undefined}
          >
            {editing && (block.hidden || empty) && (
              <span className="bg-surface-2 text-fg-muted mb-2 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
                {block.hidden ? "Hidden" : `${BLOCK_DEFS[block.type].label}: nothing to show yet`}
              </span>
            )}
            <BlockBoundary label={block.type}>
              <BlockView block={block} artist={artist} empty={empty} />
            </BlockBoundary>
          </div>
        ))}
      </div>
    </div>
  );
}
