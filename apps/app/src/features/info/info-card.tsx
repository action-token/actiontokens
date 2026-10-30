import type { ReactNode } from "react";

/** A plain card for the info pages (About, Privacy, Support). */
export function InfoCard({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="bg-surface border-fg/10 grid gap-3 rounded-[1.4rem] border-2 p-5 sm:p-6">
      {title && <h2 className="display text-xl">{title}</h2>}
      <div className="text-fg-muted grid gap-3 text-sm leading-relaxed">{children}</div>
    </section>
  );
}
