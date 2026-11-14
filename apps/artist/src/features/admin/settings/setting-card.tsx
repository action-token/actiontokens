import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Input } from "@bandcoin/ui/components/input";
import { cn } from "@bandcoin/ui/lib/cn";

/**
 * One card of Admin › Settings: an icon on a yellow blob, a display title and
 * a line on what it does, then the controls. `action` sits top right.
 */
export function SettingCard({
  icon: Icon,
  title,
  description,
  action,
  children,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("bg-surface grid gap-5 rounded-[1.75rem] border p-5 sm:p-6", className)}>
      <header className="flex items-start gap-3.5">
        <span className="blob bg-primary text-primary-foreground flex size-11 shrink-0 items-center justify-center">
          <Icon className="size-5" strokeWidth={2.4} />
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <h2 className="display text-2xl leading-none">{title}</h2>
          {description && (
            <p className="text-fg-muted mt-1.5 max-w-2xl text-sm text-pretty">{description}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      {children}
    </section>
  );
}

/** An input with its unit (%, m, USD…) shown inside it on the right. */
export function UnitInput({
  unit,
  className,
  ...props
}: React.ComponentProps<typeof Input> & { unit: string }) {
  return (
    <div className={cn("relative", className)}>
      <Input
        {...props}
        className="pr-[calc(1rem+var(--unit-w))]"
        style={{ "--unit-w": `${unit.length * 0.5 + 0.75}rem` } as React.CSSProperties}
      />
      <span className="text-fg-faint pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-bold tracking-wide">
        {unit}
      </span>
    </div>
  );
}

/** A read-only value on a card: a small label over the number. */
export function SettingFact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="bg-surface-2 rounded-2xl px-4 py-3">
      <dt className="text-fg-faint text-[11px] font-semibold tracking-wider uppercase">{label}</dt>
      <dd className="num mt-0.5 text-lg font-semibold">{value}</dd>
    </div>
  );
}
