"use client";

import { usePathname } from "next/navigation";
import { type CSSProperties, type ReactNode, useEffect } from "react";

import { cn } from "@actiontokens/ui/lib/cn";
import { PhoneTabBar } from "@actiontokens/ui/patterns/phone-tab-bar";
import { PortalBackdrop } from "@actiontokens/ui/patterns/portal-backdrop";
import { usePersistedFlag, useSidebarCollapsed } from "@actiontokens/ui/lib/sidebar-collapsed";

import { AppNotch } from "~/features/notch/app-notch";
import { BountiesPanel } from "~/features/bounty/bounties-panel";
import { ClaimPlays } from "~/features/player/claim-plays";
import { PlayerBar } from "~/features/player/player-bar";
import { usePlayer } from "~/features/player/player-store";

import { ContextPanel } from "./context-panel";
import { AR_URL, isActive, MOBILE_TABS, TAB_LABEL, type NavItem } from "./nav";
import { usePanelWidths } from "./panel-widths";
import { contextPanelFor } from "./panel-rule";
import { RightRail } from "./right-frame";
import { SearchDialog } from "./search-dialog";
import { Sidebar } from "./sidebar";

/** Width of the closed right rail. */
const RAIL = "3.25rem";

/**
 * The frame around every fan page: sidebar with search and account, a right
 * panel that changes with the page, and the player at the bottom. On phones the
 * sidebar becomes a small top bar and a bottom tab bar under the player.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const hasTrack = usePlayer((state) => state.queue.length > 0);
  const playing = usePlayer((state) => state.playing);
  const panel = contextPanelFor(pathname, hasTrack);
  const { widths, load } = usePanelWidths();
  const { collapsed, setCollapsed } = useSidebarCollapsed();
  // Closed until the fan opens it; remembered per browser.
  const [rightOpen, setRightOpen] = usePersistedFlag("action-tokens.right-panel-open", false);
  // Saved widths are read after the first render, so the server and the browser agree.
  useEffect(load, [load]);

  return (
    <div
      style={
        {
          "--panel-right": `${widths.right}px`,
          // The right column: the rail, plus the panel when it's open. The page shrinks by it.
          "--right-w": rightOpen ? `calc(${RAIL} + ${widths.right}px)` : RAIL,
        } as CSSProperties
      }
      // Fixed things across the page (the artist page's sticky bar) stop at the rail.
      data-right-rail={panel ? "" : undefined}
      className={cn(
        "grid min-h-dvh grid-cols-1 sm:grid-cols-[auto_minmax(0,1fr)]",
        panel &&
          "in-data-resizing:transition-none motion-reduce:transition-none xl:grid-cols-[auto_minmax(0,1fr)_var(--right-w)] xl:transition-[grid-template-columns] xl:duration-400 xl:ease-[ease]",
      )}
    >
      <PortalBackdrop />
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <SearchDialog />

      <div className="flex min-w-0 flex-col">
        {/* The notch hangs from the top on every page (on phones it is the top bar too): search,
            what's playing, balance, and whatever is happening (transactions, messages, news). */}
        <AppNotch />
        {pathname !== "/" && <div className="h-[68px] sm:h-12" aria-hidden />}
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
        <aside className="sticky top-0 z-50 hidden h-dvh xl:block">
          <RightRail
            title={panel === "music" ? "now playing" : "bounties"}
            label={panel === "music" ? "Now playing" : "Top bounties and recent activity"}
            open={rightOpen}
            setOpen={setRightOpen}
            eq={panel === "music"}
            playing={playing}
          >
            {panel === "music" ? <ContextPanel /> : <BountiesPanel />}
          </RightRail>
        </aside>
      )}

      <div
        className={cn(
          // A floating card like the sidebar: its bottom edge lines up with the sidebar card's (12px)
          "pointer-events-none fixed inset-x-0 bottom-[calc(var(--phone-bar-h)-1.5rem)] z-40 sm:bottom-0 sm:left-(--side-w) sm:pr-3 sm:pb-3 sm:pl-1",
          panel &&
            "in-data-resizing:transition-none motion-reduce:transition-none xl:right-(--right-w) xl:transition-[right] xl:duration-400 xl:ease-[ease]",
        )}
      >
        <ClaimPlays />
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
