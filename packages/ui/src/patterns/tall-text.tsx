import type { ReactNode } from "react";

import { cn } from "../lib/cn";

/**
 * Display words at Wadzzo's height: uppercase with tight lines, as Wadzzo's
 * Anton. Unbounded is about twice as wide, so it's squeezed sideways to fit
 * the same width; a word too long still ends in "…". `underline` adds the
 * scribble under the current page (sidebar). `className` sets the size.
 */
const SQUEEZE = 0.55;
export function TallText({
  children,
  className,
  underline = false,
}: {
  children: ReactNode;
  className?: string;
  underline?: boolean;
}) {
  return (
    <span className="block min-w-0 overflow-x-clip">
      <span
        style={{ maxWidth: `${100 / SQUEEZE}%`, transform: `scaleX(${SQUEEZE})` }}
        className={cn(
          "display relative inline-block origin-left truncate pt-[0.12em] pb-1.5 align-top leading-[0.9] tracking-normal uppercase",
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
