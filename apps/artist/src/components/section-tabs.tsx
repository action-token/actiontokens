"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@bandcoin/ui/lib/cn";

import { isActive, type SectionTab } from "~/features/shell/nav";

/** Switches between the pages that share one menu entry (e.g. Posts and Announcements). */
export function SectionTabs({ tabs, label }: { tabs: SectionTab[]; label: string }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label={label}
      className="bg-surface-2 flex w-fit max-w-full gap-1 overflow-x-auto rounded-lg border p-1"
    >
      {tabs.map((tab) => {
        const active = isActive(tab, pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm whitespace-nowrap",
              active ? "bg-surface font-medium shadow-sm" : "text-fg-muted hover:text-fg",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
