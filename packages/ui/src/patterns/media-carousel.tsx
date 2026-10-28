"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef, type ReactNode } from "react";

import { cn } from "../lib/cn";

/**
 * The one carousel: a titled row that scrolls sideways and snaps to cards.
 * Arrows on pointer devices, swipe on touch. Children are the cards.
 */
export function MediaCarousel({
  title,
  action,
  children,
  itemWidth = "minmax(150px,172px)",
  className,
}: {
  title: string;
  /** e.g. a "See all" link */
  action?: ReactNode;
  children: ReactNode;
  itemWidth?: string;
  className?: string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const scroll = (dir: -1 | 1) =>
    track.current?.scrollBy({ left: dir * track.current.clientWidth * 0.8, behavior: "smooth" });

  const arrow =
    "bg-surface hover:border-border-strong hidden size-9 place-items-center rounded-full border transition-colors [@media(pointer:fine)]:grid";

  return (
    <section className={cn("grid gap-3", className)} aria-label={title}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[17px] font-bold">{title}</h3>
        <div className="flex items-center gap-2">
          {action}
          <button type="button" className={arrow} aria-label="Scroll left" onClick={() => scroll(-1)}>
            <ChevronLeft className="size-4" />
          </button>
          <button type="button" className={arrow} aria-label="Scroll right" onClick={() => scroll(1)}>
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
      <div
        ref={track}
        tabIndex={0}
        className="scrollbar-none grid snap-x snap-mandatory auto-cols-[var(--item-w)] grid-flow-col gap-4 overflow-x-auto pb-0.5 [&>*]:snap-start"
        style={{ "--item-w": itemWidth } as React.CSSProperties}
      >
        {children}
      </div>
    </section>
  );
}
