import type { ReactNode } from "react";

import { cn } from "@bandcoin/ui/lib/cn";

/** The brand's chunky look: a dark border and a yellow offset shadow. */
export const STICKER =
  "border-fg border-2 shadow-[4px_5px_0_0_var(--color-primary)] transition-transform duration-200 hover:-translate-y-0.5";

/** A card for the info pages (About, Privacy, Support). */
export function InfoCard({
  title,
  children,
  className,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn("bg-surface grid gap-3 rounded-[1.4rem] p-5 sm:p-6", STICKER, className)}
    >
      {title && <h2 className="display text-2xl">{title}</h2>}
      <div className="text-fg-muted grid gap-3 text-sm leading-relaxed">{children}</div>
    </section>
  );
}
