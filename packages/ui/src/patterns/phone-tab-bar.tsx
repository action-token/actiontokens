import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { cn } from "../lib/cn";
import { ArTabButton } from "./ar-tab-button";

export type PhoneTab = {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  /** Another site: a plain link, never lit */
  external?: boolean;
};

const tab =
  "relative z-10 flex h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl text-[8.5px] font-bold uppercase transition-colors";

/**
 * The phone's bottom bar, the same on every app: flush with the bottom and both sides, rounded on top
 * only, in the sidebar's colours, two tabs, the raised AR key, two tabs. The active tab gets an ink
 * capsule that glides to it (one translated indicator over four equal slots; the AR key's slot is a
 * fifth). Hidden from `sm` up, where the sidebar takes over. Pages pad their bottom with
 * `--phone-bar-space`.
 */
export function PhoneTabBar({
  left,
  right,
  arHref,
  className,
}: {
  left: PhoneTab[];
  right: PhoneTab[];
  arHref: string;
  className?: string;
}) {
  const all = [...left, ...right];
  const slots = left.length + 1 + right.length;
  const activeIndex = all.findIndex((t) => t.active && !t.external);
  // Slot of the active tab: the AR key sits after the left tabs.
  const slot = activeIndex < 0 ? -1 : activeIndex < left.length ? activeIndex : activeIndex + 1;

  const link = (t: PhoneTab) => (
    <Link
      key={t.href}
      href={t.href}
      aria-current={t.active && !t.external ? "page" : undefined}
      className={cn(tab, t.active && !t.external ? "text-side" : "text-side-ink/75")}
    >
      <t.icon className="size-5" strokeWidth={2.4} />
      <span className="w-full truncate text-center">{t.label}</span>
    </Link>
  );

  return (
    <nav
      aria-label="Tabs"
      className={cn(
        "side-scope bg-side text-side-ink fixed inset-x-0 bottom-0 z-40 rounded-t-[1.5rem] px-1.5 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] shadow-[0_-10px_28px_-14px_hsl(0_0%_0%/0.55)] sm:hidden",
        className,
      )}
    >
      <div className="relative mx-auto flex max-w-md items-center">
        {slot >= 0 && (
          <span
            aria-hidden
            data-slot={slot}
            className="bg-side-ink absolute top-0 left-0 h-12 rounded-2xl transition-transform duration-300 ease-[cubic-bezier(0.2,0.7,0.2,1)]"
            style={{ width: `${100 / slots}%`, transform: `translateX(${slot * 100}%)` }}
          />
        )}
        {left.map(link)}
        <ArTabButton href={arHref} className="text-side-ink" />
        {right.map(link)}
      </div>
    </nav>
  );
}
