import { cn } from "../lib/cn";

/**
 * The outer frame of every page. Every page uses the same frame, so the title
 * and content start at the same left edge and keep the same side padding on
 * every page; a narrower page (a form) narrows its content inside the frame
 * (left-aligned), never the frame itself. Each app may set in its stylesheet:
 *
 *   --page-max            frame width              (default 80rem)
 *   --page-pad-bottom     bottom room              (default 2.5rem)
 *   --page-pad-bottom-lg  bottom room from `lg` up (default 2.5rem)
 *   --page-pad-bottom-form / -lg  bottom room of create/edit pages (default 2.5rem)
 */
export function pageContainerClass({
  form = false,
  className,
}: {
  /** @deprecated every page has the same width now */
  wide?: boolean;
  form?: boolean;
  className?: string;
} = {}) {
  return cn(
    "mx-auto w-full max-w-[var(--page-max,80rem)] px-4 pt-5 sm:px-8 lg:pt-8",
    form
      ? "pb-[var(--page-pad-bottom-form,2.5rem)] lg:pb-[var(--page-pad-bottom-form-lg,2.5rem)]"
      : "pb-[var(--page-pad-bottom,2.5rem)] lg:pb-[var(--page-pad-bottom-lg,2.5rem)]",
    className,
  );
}
