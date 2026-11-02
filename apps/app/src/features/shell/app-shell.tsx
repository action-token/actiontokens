"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type CSSProperties, type ReactNode, useEffect } from "react";

import { cn } from "@bandcoin/ui/lib/cn";
import { BrandMark } from "@bandcoin/ui/patterns/boot-screen";

import { AccountButton } from "~/features/account/account-button";
import { BountiesPanel } from "~/features/bounty/bounties-panel";
import { PlayerBar } from "~/features/player/player-bar";
import { usePlayer } from "~/features/player/player-store";

import { ContextPanel } from "./context-panel";
import { isActive, MOBILE_TABS } from "./nav";
import { usePanelWidths } from "./panel-widths";
import { contextPanelFor } from "./panel-rule";
import { ResizeHandle } from "./resize-handle";
import { SearchBox } from "./search-box";
import { Sidebar } from "./sidebar";

/**
 * The frame around every fan page: sidebar with search and account, a right
 * panel that changes with the page, and the player at the bottom. On phones the
 * sidebar becomes a small top bar and a bottom tab bar under the player.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const hasTrack = usePlayer((state) => state.queue.length > 0);
  const panel = contextPanelFor(pathname, hasTrack);
  const { widths, load } = usePanelWidths();
  // Saved widths are read after the first render, so the server and the browser agree.
  useEffect(load, [load]);

  return (
    <div
      style={
        {
          "--panel-left": `${widths.left}px`,
          "--panel-right": `${widths.right}px`,
        } as CSSProperties
      }
      className={cn(
        "grid min-h-dvh grid-cols-1 sm:grid-cols-[72px_minmax(0,1fr)]",
        panel
          ? "xl:grid-cols-[var(--panel-left)_minmax(0,1fr)_var(--panel-right)]"
          : "xl:grid-cols-[var(--panel-left)_minmax(0,1fr)]",
      )}
    >
      <Sidebar />

      <div className="flex min-w-0 flex-col">
        {/* Phones have no sidebar, so search and the account stay in a small bar. */}
        <header className="bg-bg/85 sticky top-0 z-30 flex h-16 items-center gap-3 border-b px-4 backdrop-blur sm:hidden">
          <Link href="/" aria-label="Home">
            <BrandMark className="size-7" />
          </Link>
          <SearchBox className="flex-1" />
          <AccountButton />
        </header>
        <main className="flex-1 pb-32 sm:pb-20">{children}</main>
      </div>

      {panel && (
        <aside
          aria-label={panel === "music" ? "Now playing" : "Top bounties and recent activity"}
          className="bg-surface sticky top-0 hidden h-dvh border-l xl:block"
        >
          <ResizeHandle side="right" label="Resize the right panel" />
          <div className="h-full overflow-y-auto p-4">
            {panel === "music" ? <ContextPanel /> : <BountiesPanel />}
          </div>
        </aside>
      )}

      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 sm:left-[72px] xl:left-[var(--panel-left)]",
          panel && "xl:right-[var(--panel-right)]",
        )}
      >
        <PlayerBar />
        <nav
          aria-label="Tabs"
          className="bg-surface grid grid-cols-5 border-t pb-[env(safe-area-inset-bottom)] sm:hidden"
        >
          {MOBILE_TABS.map((entry) => (
            <Link
              key={entry.label}
              href={entry.href}
              aria-current={isActive(entry, pathname, null) ? "page" : undefined}
              className="text-fg-faint aria-[current=page]:text-fg grid justify-items-center gap-0.5 py-2 text-[10px] font-medium"
            >
              <entry.icon className="size-5" />
              {entry.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
