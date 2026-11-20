import type { ReactNode } from "react";

/**
 * One block of a settings tab: what it is on the left, the controls on the
 * right (stacked on phones), like most settings pages.
 */
export function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="grid grid-cols-1 gap-4 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10">
      <div className="lg:pt-1">
        <h2 className="text-base font-semibold">{title}</h2>
        {description && <p className="text-fg-muted mt-1 text-sm text-pretty">{description}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}
