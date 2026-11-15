import type { ReactNode } from "react";

import { SectionTitle } from "@bandcoin/ui/patterns/media-carousel";

import type { Block } from "@bandcoin/page/blocks";

/** The text setting of a block, or a fallback. */
export const textSetting = (block: Block, key: string, fallback = ""): string =>
  typeof block.settings[key] === "string" ? block.settings[key] : fallback;

/** How many to show, within the block's own limits. */
export const countSetting = (block: Block, fallback: number): number =>
  typeof block.settings.count === "number" ? block.settings.count : fallback;

/** A list setting (links, videos, members). */
export const listSetting = <T,>(block: Block, key: string): T[] =>
  Array.isArray(block.settings[key]) ? (block.settings[key] as T[]) : [];

/**
 * Card grids that would drop to one huge card per row in a narrow block (a quarter is
 * just under two 11rem cards): smaller cards until the block (an @container) is wider.
 */
export const CARD_GRID =
  "grid grid-cols-[repeat(auto-fill,minmax(min(8rem,100%),1fr))] @md:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]";

/**
 * Grids inside a block size their columns to the block, not the screen: a block can be
 * a quarter of the row or all of it, so `auto-fill` with a minimum card width.
 */
export const fill = (min: string) => ({
  gridTemplateColumns: `repeat(auto-fill, minmax(min(${min}, 100%), 1fr))`,
});

/** A block's heading (with an optional action on the right), then its content. */
export function BlockSection({
  title,
  note,
  action,
  children,
}: {
  title: string;
  note?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-4" aria-label={title}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SectionTitle title={title} note={note} />
        {action}
      </div>
      {children}
    </section>
  );
}

/** In the editor only: what a block will show once it has something (fans never see an empty block). */
export function EmptyLine({ children }: { children: ReactNode }) {
  return (
    <p className="text-fg-muted rounded-[var(--page-radius)] border-2 border-dashed px-4 py-8 text-center text-sm">
      {children}
    </p>
  );
}
