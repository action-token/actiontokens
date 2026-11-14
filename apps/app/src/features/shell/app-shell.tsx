"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { type CSSProperties, type ReactNode, useEffect } from "react";

import { cn } from "@bandcoin/ui/lib/cn";
import { PhoneTabBar } from "@bandcoin/ui/patterns/phone-tab-bar";
import { useSidebarCollapsed } from "@bandcoin/ui/lib/sidebar-collapsed";

import { AccountButton } from "~/features/account/account-button";
import { BountiesPanel } from "~/features/bounty/bounties-panel";
import { PlayerBar } from "~/features/player/player-bar";
import { usePlayer } from "~/features/player/player-store";

import { ContextPanel } from "./context-panel";
import { AR_URL, isActive, MOBILE_TABS, TAB_LABEL, type NavItem } from "./nav";
import { usePanelWidths } from "./panel-widths";
import { contextPanelFor } from "./panel-rule";
import { ResizeHandle } from "./resize-handle";
import { openSearch, SearchDialog } from "./search-dialog";
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
  const { collapsed, setCollapsed } = useSidebarCollapsed();
  // Saved widths are read after the first render, so the server and the browser agree.
  useEffect(load, [load]);

  return (
    <div
      style={
        {
          "--panel-right": `${widths.right}px`,
        } as CSSProperties
      }
      className={cn(
        "grid min-h-dvh grid-cols-1 sm:grid-cols-[auto_minmax(0,1fr)]",
        panel && "xl:grid-cols-[auto_minmax(0,1fr)_var(--panel-right)]",
      )}
    >
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <SearchDialog />

      <div className="flex min-w-0 flex-col">
        {/* Phones have no sidebar, so search and the account stay in a small bar. */}
        <header className="bg-bg/85 sticky top-0 z-30 flex h-16 items-center gap-3 border-b px-4 backdrop-blur sm:hidden">
          <Link href="/" aria-label="Home">
            <Image src="/images/logo.png" alt="" width={313} height={364} className="h-8 w-auto" />
          </Link>
          <button
            type="button"
            onClick={openSearch}
            aria-label="Search"
            className="bg-surface-2 text-fg-faint flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full border px-3.5 text-left text-sm"
          >
            <Search className="size-4 shrink-0" />
            <span className="truncate">Search songs, artists</span>
          </button>
          <AccountButton />
        </header>
        <main
          className={cn(
            "flex-1 pb-[calc(var(--phone-bar-space)+5rem)] sm:pl-(--side-w)",
            hasTrack ? "sm:pb-24" : "sm:pb-0",
          )}
        >
          {children}
        </main>
      </div>

      {panel && (
        <aside
          aria-label={panel === "music" ? "Now playing" : "Top bounties and recent activity"}
          className="bg-surface sticky top-0 hidden h-dvh border-l xl:block"
        >
          <ResizeHandle side="right" label="Resize the right panel" />
          <div className="h-full overflow-x-hidden overflow-y-auto p-4">
            {panel === "music" ? <ContextPanel /> : <BountiesPanel />}
          </div>
        </aside>
      )}

      <div
        className={cn(
          "fixed inset-x-0 bottom-[var(--phone-bar-space)] z-40 sm:bottom-0 sm:left-(--side-w)",
          panel && "xl:right-[var(--panel-right)]",
        )}
      >
        <PlayerBar />
      </div>
      <PhoneTabBar
        left={MOBILE_TABS.left.map(tabOf)}
        right={MOBILE_TABS.right.map(tabOf)}
        arHref={AR_URL}
      />
    </div>
  );

  function tabOf(entry: NavItem) {
    return {
      href: entry.href,
      label: TAB_LABEL[entry.label] ?? entry.label,
      icon: entry.icon,
      active: isActive(entry, pathname, null),
    };
  }
}
