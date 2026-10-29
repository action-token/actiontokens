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

/** A block's heading with its content under it. */
export function BlockSection({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-4" aria-label={title}>
      <SectionTitle title={title} note={note} />
      {children}
    </section>
  );
}

/** What a visitor sees when a block has nothing to show and wasn't hidden. */
export function EmptyLine({ children }: { children: ReactNode }) {
  return (
    <p className="text-fg-muted bg-surface rounded-[var(--page-radius)] border border-dashed px-4 py-6 text-center text-sm">
      {children}
    </p>
  );
}
