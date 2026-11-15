"use client";

import { ArrowDown, ArrowUp, Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";

import type { Block, BlockType, BlockWidth } from "@bandcoin/page/blocks";
import { BLOCK_DEFS, styleOf, type StyledBlockType } from "@bandcoin/page/blocks";
import { stylesFor, type PageAction } from "@bandcoin/page/editor";
import { type PageTheme, themeVars } from "@bandcoin/page/theme";
import { cn } from "@bandcoin/ui/lib/cn";

import { blocksToShow, rowSpans, type ArtistPageData } from "./artist-page-data";
import {
  CollectiblesBlock,
  MembershipBlock,
  MusicBlock,
  ReleasesBlock,
  TourBlock,
} from "./blocks/catalog";
import {
  AboutBlock,
  BandMembersBlock,
  HighlightsBlock,
  LinksBlock,
  StoriesBlock,
  VideosBlock,
} from "./blocks/story";
import { CoverBanner } from "./cover-banner";

/** Columns a block spans on a wide screen (everything is full width on a phone). */
const SPAN: Record<BlockWidth, string> = {
  1: "md:col-span-1",
  2: "md:col-span-2",
  3: "md:col-span-3",
  4: "md:col-span-4",
};
const WIDTHS: { value: BlockWidth; label: string }[] = [
  { value: 1, label: "¼" },
  { value: 2, label: "½" },
  { value: 3, label: "¾" },
  { value: 4, label: "Full" },
];

const FONT: Record<PageTheme["fontPair"], string> = {
  grotesk: "",
  sans: "font-sans",
  serif: "font-serif",
};

function BlockView({
  block,
  artist,
  empty,
  editing,
}: {
  block: Block;
  artist: ArtistPageData;
  empty: boolean;
  editing: boolean;
}) {
  switch (block.type satisfies BlockType) {
    case "cover":
      return null; // drawn above the grid, edge to edge
    case "about":
      return <AboutBlock block={block} artist={artist} empty={empty} />;
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
    case "stories":
      return <StoriesBlock block={block} artist={artist} editing={editing} />;
    case "highlights":
      return <HighlightsBlock block={block} artist={artist} editing={editing} />;
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
 * An artist's page: the cover across the full width (behind the sidebar, like Home's
 * hero), then their blocks in a four-column grid, in their theme. Used by the public
 * page and by the page builder's live preview (`editing`), where a block is selected by
 * clicking it, gets a toolbar (move, width, style, hide, remove) and a + to add a block
 * after it; hidden or empty blocks are shown dimmed there (fans never see them).
 */
export function PageRenderer({
  blocks,
  theme,
  artist,
  editing = false,
  selectedUid,
  onSelect,
  onAction,
}: {
  blocks: Block[];
  theme: PageTheme;
  artist: ArtistPageData;
  editing?: boolean;
  selectedUid?: string | null;
  onSelect?: (uid: string) => void;
  onAction?: (action: PageAction) => void;
}) {
  const shown = blocksToShow(blocks, artist, editing);
  const cover = shown.find(({ block }) => block.type === "cover")?.block;
  const rest = shown.filter(({ block }) => block.type !== "cover");
  const last = rest.at(-1)?.block ?? cover;
  const spans = rowSpans(rest.map(({ block }) => block.width));
  const act = (action: PageAction) => onAction?.(action);

  return (
    <div
      className={cn("artist-page w-full", FONT[theme.fontPair])}
      style={{
        ...themeVars(theme),
        fontFamily: theme.fontPair === "grotesk" ? undefined : "var(--page-font)",
      }}
    >
      {cover && (
        <div
          data-block-uid={cover.uid}
          data-block-type="cover"
          className={cn(
            "group/block relative",
            editing && "cursor-pointer outline-3 -outline-offset-3 transition-[outline-color]",
            editing &&
              (selectedUid === cover.uid
                ? "outline-[var(--page-accent)]"
                : "outline-transparent hover:outline-[color-mix(in_srgb,var(--page-accent)_45%,transparent)]"),
          )}
          onClick={editing ? () => onSelect?.(cover.uid) : undefined}
        >
          <CoverBanner
            artist={artist}
            align={cover.settings.align === "center" ? "center" : "left"}
            bleed
            sticky={!editing}
          />
          {editing && (
            <AddAfter
              label="Add a block at the top"
              onClick={() => act({ kind: "insert", after: cover.uid })}
            />
          )}
        </div>
      )}

      <div className="grid w-full max-w-[var(--page-max,96rem)] grid-cols-1 gap-x-[var(--page-gap)] gap-y-[calc(var(--page-gap)*2.25)] px-4 pt-8 pb-6 sm:px-8 md:grid-cols-4">
        {rest.map(({ block, empty }, index) => {
          const selected = editing && selectedUid === block.uid;
          // Position among all blocks (the cover is 0), for the move buttons.
          const position = blocks.findIndex((entry) => entry.uid === block.uid);
          return (
            <div
              key={block.uid}
              data-block-uid={block.uid}
              data-block-type={block.type}
              className={cn(
                SPAN[spans[index] ?? block.width],
                // A container, so what's inside fits the block's width, not the screen's.
                "group/block @container relative min-w-0",
                editing &&
                  "cursor-pointer rounded-[var(--page-radius)] outline-2 outline-offset-8 transition-[outline-color]",
                editing &&
                  (selected
                    ? "outline-[var(--page-accent)]"
                    : "outline-transparent hover:outline-[color-mix(in_srgb,var(--page-accent)_45%,transparent)]"),
              )}
              onClick={editing ? () => onSelect?.(block.uid) : undefined}
            >
              {editing && (block.hidden || empty) && (
                <span className="bg-surface-2 text-fg-muted mb-3 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
                  {block.hidden ? "Hidden from fans" : "Fans see this once it has something"}
                </span>
              )}
              <div className={cn(editing && (block.hidden || empty) && "opacity-55")}>
                <BlockBoundary label={block.type}>
                  <BlockView block={block} artist={artist} empty={empty} editing={editing} />
                </BlockBoundary>
              </div>
              {selected && (
                <BlockToolbar
                  block={block}
                  canUp={position > 1}
                  canDown={position < blocks.length - 1}
                  onAction={act}
                />
              )}
              {editing && (
                <AddAfter
                  label={`Add a block after ${BLOCK_DEFS[block.type].label}`}
                  onClick={() => act({ kind: "insert", after: block.uid })}
                  last={index === rest.length - 1}
                />
              )}
            </div>
          );
        })}

        {editing && last && (
          <button
            type="button"
            onClick={() => act({ kind: "insert", after: last.uid })}
            className="text-fg-muted hover:text-fg flex h-24 items-center justify-center gap-2 rounded-[var(--page-radius)] border-2 border-dashed text-sm font-semibold transition-colors hover:border-[var(--page-accent)] md:col-span-4"
          >
            <Plus className="size-4" /> Add a block
          </button>
        )}
      </div>
    </div>
  );
}

/** The + under a block (on hover, or while it is selected): add a block right after it. */
function AddAfter({
  label,
  onClick,
  last = false,
}: {
  label: string;
  onClick: () => void;
  last?: boolean;
}) {
  if (last) return null; // the big "Add a block" tile follows the last one
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className="absolute -bottom-4 left-1/2 z-20 grid size-8 -translate-x-1/2 translate-y-1/2 place-items-center rounded-full bg-[var(--page-accent)] text-[var(--page-accent-ink)] opacity-0 shadow-md transition-[opacity,transform] group-hover/block:opacity-100 hover:scale-110 focus-visible:opacity-100"
    >
      <Plus className="size-4" strokeWidth={3} />
    </button>
  );
}

/** On the selected block: move, width, style, hide, remove. Each tells the editor. */
function BlockToolbar({
  block,
  canUp,
  canDown,
  onAction,
}: {
  block: Block;
  canUp: boolean;
  canDown: boolean;
  onAction: (action: PageAction) => void;
}) {
  const styles = stylesFor(block.type);
  const current = styles.length > 0 ? styleOf(block, block.type as StyledBlockType) : null;
  const tool =
    "grid h-7 min-w-7 place-items-center rounded-full px-1.5 text-xs font-semibold transition-colors hover:bg-white/15 disabled:opacity-30 disabled:hover:bg-transparent";
  const on = "bg-[var(--page-accent)] text-[var(--page-accent-ink)] hover:bg-[var(--page-accent)]";
  const stop = (run: () => void) => (event: React.MouseEvent) => {
    event.stopPropagation();
    run();
  };

  return (
    <div
      role="toolbar"
      aria-label={`${BLOCK_DEFS[block.type].label} tools`}
      className="absolute -top-5 right-2 z-30 flex max-w-[calc(100%-1rem)] flex-wrap items-center gap-0.5 rounded-2xl bg-neutral-950 p-1 text-white shadow-xl"
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className={tool}
        aria-label="Move up"
        title="Move up"
        disabled={!canUp}
        onClick={stop(() => onAction({ kind: "move", uid: block.uid, direction: -1 }))}
      >
        <ArrowUp className="size-3.5" />
      </button>
      <button
        type="button"
        className={tool}
        aria-label="Move down"
        title="Move down"
        disabled={!canDown}
        onClick={stop(() => onAction({ kind: "move", uid: block.uid, direction: 1 }))}
      >
        <ArrowDown className="size-3.5" />
      </button>
      <span className="mx-0.5 h-4 w-px bg-white/20" aria-hidden />
      {WIDTHS.map((width) => (
        <button
          key={width.value}
          type="button"
          aria-label={`Width ${width.label}`}
          aria-pressed={block.width === width.value}
          title={`Width ${width.label}`}
          className={cn(tool, block.width === width.value && on)}
          onClick={stop(() => onAction({ kind: "width", uid: block.uid, width: width.value }))}
        >
          {width.label}
        </button>
      ))}
      {styles.length > 0 && (
        <>
          <span className="mx-0.5 h-4 w-px bg-white/20" aria-hidden />
          {styles.map((style) => (
            <button
              key={style.value}
              type="button"
              aria-pressed={current === style.value}
              className={cn(tool, "px-2.5", current === style.value && on)}
              onClick={stop(() => onAction({ kind: "style", uid: block.uid, style: style.value }))}
            >
              {style.label}
            </button>
          ))}
        </>
      )}
      <span className="mx-0.5 h-4 w-px bg-white/20" aria-hidden />
      <button
        type="button"
        className={tool}
        aria-label={block.hidden ? "Show to fans" : "Hide from fans"}
        title={block.hidden ? "Show to fans" : "Hide from fans"}
        onClick={stop(() => onAction({ kind: "toggle-hidden", uid: block.uid }))}
      >
        {block.hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
      </button>
      <button
        type="button"
        className={cn(tool, "hover:bg-red-500/80")}
        aria-label="Remove block"
        title="Remove block"
        onClick={stop(() => onAction({ kind: "remove", uid: block.uid }))}
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}
