import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../lib/cn";
import { pageContainerClass } from "./page-layout";

/**
 * Every page's top: optional back link, eyebrow, title, one-line description,
 * and actions on the right (stacking under the title on phones).
 */
export function PageHeader({
  title,
  note,
  description,
  eyebrow,
  actions,
  back,
  className,
}: {
  title: ReactNode;
  /** A hand-written line under the title (the display/marker pairing used across the apps) */
  note?: ReactNode;
  description?: ReactNode;
  eyebrow?: string;
  actions?: ReactNode;
  back?: { href: string; label: string };
  className?: string;
}) {
  return (
    <header
      className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}
    >
      <div className="min-w-0">
        {back && (
          <Link
            href={back.href}
            className="text-muted-foreground hover:text-foreground mb-2 inline-flex items-center gap-1 text-xs font-semibold tracking-wider uppercase"
          >
            <ChevronLeft className="size-3.5" />
            {back.label}
          </Link>
        )}
        {eyebrow && (
          <p
            data-slot="page-eyebrow"
            className="text-primary-text mb-1 text-xs font-semibold tracking-[0.08em] uppercase"
          >
            {eyebrow}
          </p>
        )}
        <h1 className="display text-foreground text-[2.75rem] break-words sm:text-6xl lg:text-7xl">
          {title}
        </h1>
        {note && <p className="marker text-primary-text mt-1 -rotate-1 text-lg">{note}</p>}
        {description && (
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/**
 * Standard page body: the shared frame (same width and padding on every page),
 * then the page's own content. A width in `className` (max-w-3xl…) narrows the
 * content inside the frame, left-aligned, so every page starts at the same edge.
 */
export function PageBody({
  children,
  className,
  wide: _wide,
  ...attrs
}: {
  children: ReactNode;
  className?: string;
  /** @deprecated every page has the same width now */
  wide?: boolean;
} & Omit<HTMLAttributes<HTMLDivElement>, "children" | "className">) {
  return (
    <div className={pageContainerClass()}>
      <div {...attrs} className={cn("w-full", className)}>
        {children}
      </div>
    </div>
  );
}
