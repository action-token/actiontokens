import type { ReactNode } from "react";

/** The bordered card the Short link and Custom domain tabs are built from. */
export function PanelCard({ children }: { children: ReactNode }) {
  return (
    <section className="bg-surface grid content-start gap-5 rounded-[1.4rem] border-2 p-5 sm:p-6">
      {children}
    </section>
  );
}

/** A part of a card below a rule. */
export function PanelSection({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 border-t pt-5">{children}</div>;
}
