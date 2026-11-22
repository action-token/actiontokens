"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Menu, ScanLine, Settings, Store } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

import { cn } from "@actiontokens/ui/lib/cn";
import { useSidebarCollapsed } from "@actiontokens/ui/lib/sidebar-collapsed";
import { BrandMark } from "@actiontokens/ui/patterns/boot-screen";
import { PhoneTabBar } from "@actiontokens/ui/patterns/phone-tab-bar";
import { SideLaunchTiles, SideMenuSheet } from "@actiontokens/ui/patterns/side-frame";

import { AccountButton } from "~/features/account/account-button";
import {
  MENU_ROW,
  NotificationsMenuLink,
  useUnreadNotifications,
} from "~/features/notifications/notifications-link";
import { type PortalStatus, usePortal } from "~/features/portal/use-portal";

import { AR_URL, FAN_APP_URL, PORTAL_MENU_CLOSE_EVENT, PORTAL_MENU_EVENT } from "./links";
import { isActive, type NavGroup, type NavItem, navFor, phoneLabel, phoneTabs } from "./nav";
import { Sidebar } from "./sidebar";
import { Landing } from "./landing";
import { TOUR_EVENT, TOUR_NAV } from "./feature-tour";
import { PortalBackdrop } from "@actiontokens/ui/patterns/portal-backdrop";

/**
 * The frame around every portal page: a sidebar of what this person may use
 * right now (see navFor), a top bar with the account, and a tab bar on phones.
 * Signed out, every address shows the front page, and the sidebar lists its tour.
 */
export function PortalShell({
  children,
  initialStatus,
}: {
  children: ReactNode;
  initialStatus?: PortalStatus;
}) {
  const pathname = usePathname();
  const { signedIn, step, isAdmin, artist, loading } = usePortal(initialStatus);
  const groups = navFor({ signedIn, step, isAdmin });
  const { collapsed, setCollapsed } = useSidebarCollapsed();

  const signedOut = !loading && !signedIn;
  // Signed out: the sidebar lists the front page's tour, and follows it as it scrolls.
  const [tourAt, setTourAt] = useState(-1);
  useEffect(() => {
    const on = (event: Event) => setTourAt((event as CustomEvent<number>).detail);
    addEventListener(TOUR_EVENT, on);
    return () => removeEventListener(TOUR_EVENT, on);
  }, []);
  const navGroups = signedOut ? TOUR_NAV : groups;
  const navPath = signedOut ? (tourAt >= 0 ? `/#tour-${tourAt + 1}` : "/") : pathname;

  return (
    <div className="grid min-h-dvh grid-cols-1 sm:grid-cols-[auto_minmax(0,1fr)]">
      <PortalBackdrop />
      <Sidebar
        groups={navGroups}
        pathname={navPath}
        portalName={isAdmin && step !== "READY" ? "admin portal" : "organization portal"}
        fallbackName={artist?.name}
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
      />

      <MobileTabs groups={navGroups} pathname={navPath} signedIn={signedIn} header={!signedOut} />

      <main className="min-w-0 pb-[var(--phone-bar-space)] sm:pb-12 sm:pl-(--side-w)">
        {signedOut ? <Landing /> : children}
      </main>
    </div>
  );
}

/**
 * Phones, as in Wadzzo's brand portal: a header with the wordmark, notifications, the account and
 * Menu (every page, as a drawer from the right), and the shared bottom bar: Map, Store | AR |
 * Bounties, Pins.
 */
function MobileTabs({
  groups,
  pathname,
  signedIn,
  header = true,
}: {
  groups: NavGroup[];
  pathname: string;
  signedIn: boolean;
  /** Signed out, the front page's notch stands in for the header (and opens the menu). */
  header?: boolean;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setOpen(true);
    const off = () => setOpen(false);
    addEventListener(PORTAL_MENU_EVENT, on);
    addEventListener(PORTAL_MENU_CLOSE_EVENT, off);
    return () => {
      removeEventListener(PORTAL_MENU_EVENT, on);
      removeEventListener(PORTAL_MENU_CLOSE_EVENT, off);
    };
  }, []);
  const unread = useUnreadNotifications();
  const { left, right } = phoneTabs(groups);
  const tabOf = (entry: NavItem) => ({
    href: entry.href,
    label: phoneLabel(entry),
    icon: entry.icon,
    active: isActive(entry, pathname),
  });
  return (
    <>
      {header && (
        <header className="bg-bg/95 sticky top-0 z-30 flex h-14 items-center gap-2 border-b pr-3 pl-4 sm:hidden">
          <Link
            href="/"
            aria-label="Organization portal home"
            className="flex min-w-0 flex-1 items-center gap-2"
          >
            <BrandMark className="h-7" />
            <span className="marker text-primary-text truncate text-sm">organization portal</span>
          </Link>
          {signedIn && (
            <Link
              href="/notifications"
              aria-label={unread > 0 ? `Notifications (${unread} new)` : "Notifications"}
              className="bg-surface relative flex size-9 shrink-0 items-center justify-center rounded-full border"
            >
              <Bell className="size-[18px]" />
              {unread > 0 && (
                <span className="bg-danger ring-bg absolute top-0.5 right-0.5 size-2.5 rounded-full ring-2" />
              )}
            </Link>
          )}
          <AccountButton compact />
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Menu"
            className="bg-primary text-primary-ink flex size-9 shrink-0 items-center justify-center rounded-full active:scale-95"
          >
            <Menu className="size-5" />
          </button>
        </header>
      )}
      {left.length + right.length > 0 && (
        <PhoneTabBar left={left.map(tabOf)} right={right.map(tabOf)} arHref={AR_URL} />
      )}
      <SideMenuSheet
        open={open}
        onOpenChange={setOpen}
        home={{ href: "/", label: "Portal home", tagline: "organization portal" }}
        description="Every page in the organization portal"
        infoBase={FAN_APP_URL}
        quick={
          <>
            <AccountButton />
            {signedIn && (
              <NotificationsMenuLink
                active={pathname.startsWith("/notifications")}
                onNavigate={() => setOpen(false)}
              />
            )}
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              aria-current={pathname.startsWith("/settings") ? "page" : undefined}
              className={MENU_ROW}
            >
              <Settings className="size-[18px]" /> Settings
            </Link>
          </>
        }
        groups={groups.map((group) => ({
          title: group.title,
          items: group.items.map((entry) => ({
            href: entry.href,
            label: entry.label,
            icon: entry.icon,
            active: isActive(entry, pathname),
          })),
        }))}
        footer={
          <SideLaunchTiles
            tiles={[
              {
                href: AR_URL,
                title: "Go to AR",
                hint: "Your drops on the map",
                icon: ScanLine,
                tone: "ink",
              },
              {
                href: FAN_APP_URL,
                title: "Marketplace",
                hint: "See it as fans do",
                icon: Store,
                tone: "mint",
              },
            ]}
          />
        }
      />
    </>
  );
}
