import type { ReactNode } from "react";

import { cn } from "../lib/cn";

/**
 * Display words, set tall: the display face condensed, uppercase, tight lines. A word
 * too long ends in "…". `underline` adds the
 * scribble under the current page (sidebar). `className` sets the size.
 */
export function TallText({
  children,
  className,
  underline = false,
  center = false,
}: {
  children: ReactNode;
  className?: string;
  underline?: boolean;
  /** Centred in its line */
  center?: boolean;
}) {
  return (
    <span className={cn("block min-w-0 overflow-x-clip", center && "text-center")}>
      <span
        className={cn(
          "display relative inline-block max-w-full truncate pt-[0.12em] pb-1.5 align-top leading-[0.9] tracking-normal uppercase",
          className,
        )}
      >
        {children}
        {underline && (
          <svg
            aria-hidden
            viewBox="0 0 120 10"
            preserveAspectRatio="none"
            className="text-side-ink absolute bottom-0 left-0 h-2 w-full"
          >
            <path
              d="M2 6 C 30 1, 60 9, 118 3"
              fill="none"
              stroke="currentColor"
              strokeWidth="3.5"
              strokeLinecap="round"
            />
          </svg>
        )}
      </span>
    </span>
  );
}
