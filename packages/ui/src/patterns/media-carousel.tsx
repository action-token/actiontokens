"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useRef, type ReactNode } from "react";

import { cn } from "../lib/cn";

/**
 * The one carousel: a titled row that scrolls sideways and snaps to cards.
 * Arrows on pointer devices, swipe on touch. Children are the cards.
 * Pass `onEndReached` to load more: it fires when the row is scrolled (or arrowed) to within
 * about a screen of its end; the caller guards against double fetches and appends cards.
 */
export function MediaCarousel({
  title,
  note,
  action,
  children,
  itemWidth = "minmax(150px,172px)",
  onEndReached,
  className,
}: {
  title: string;
  /** A short hand-written line under the title, e.g. "what fans play most" */
  note?: string;
  /** e.g. a "See all" link */
  action?: ReactNode;
  children: ReactNode;
  itemWidth?: string;
  /** Called when the row nears its end, to fetch the next page of cards. */
  onEndReached?: () => void;
  className?: string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const checkEnd = useCallback(() => {
    const el = track.current;
    if (!el || !onEndReached) return;
    if (el.scrollLeft + el.clientWidth * 2 >= el.scrollWidth) onEndReached();
  }, [onEndReached]);
  const scroll = (dir: -1 | 1) => {
    track.current?.scrollBy({ left: dir * track.current.clientWidth * 0.8, behavior: "smooth" });
    // Already at the end, the row won't scroll (no scroll event), so ask directly.
    if (dir === 1) checkEnd();
  };

  const arrow =
    "bg-surface hover:border-border-strong hidden size-9 place-items-center rounded-full border transition-colors [@media(pointer:fine)]:grid";

  return (
    <section className={cn("grid gap-3", className)} aria-label={title}>
      <div className="flex items-end justify-between gap-3">
        <SectionTitle title={title} note={note} />
        <div className="flex items-center gap-2">
          {action}
          <button
            type="button"
            className={arrow}
            aria-label="Scroll left"
            onClick={() => scroll(-1)}
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            className={arrow}
            aria-label="Scroll right"
            onClick={() => scroll(1)}
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
      <div
        ref={track}
        tabIndex={0}
        onScroll={onEndReached ? checkEnd : undefined}
        className="scrollbar-none -mt-2 -mb-2 grid snap-x snap-mandatory auto-cols-[var(--item-w)] grid-flow-col gap-4 overflow-x-auto pt-2 pb-2.5 [&>*]:snap-start"
        style={{ "--item-w": itemWidth } as React.CSSProperties}
      >
        {children}
      </div>
    </section>
  );
}

/** A section heading: the title in the display face and an optional hand-written note under it. */
export function SectionTitle({
  title,
  note,
  className,
}: {
  title: ReactNode;
  note?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid min-w-0", className)}>
      <h3 className="display text-4xl sm:text-[2.6rem] lg:text-5xl">{title}</h3>
      {note && <p className="marker text-fg-muted -rotate-1 text-base">{note}</p>}
    </div>
  );
}
