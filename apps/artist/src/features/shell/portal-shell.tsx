"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Menu, ScanLine, Settings, Store } from "lucide-react";
import { type ReactNode, useState } from "react";

import { cn } from "@bandcoin/ui/lib/cn";
import { useSidebarCollapsed } from "@bandcoin/ui/lib/sidebar-collapsed";
import { BrandMark } from "@bandcoin/ui/patterns/boot-screen";
import { PhoneTabBar } from "@bandcoin/ui/patterns/phone-tab-bar";
import { SideLaunchTiles, SideMenuSheet } from "@bandcoin/ui/patterns/side-frame";

import { AccountButton } from "~/features/account/account-button";
import {
  MENU_ROW,
  NotificationsMenuLink,
  useUnreadNotifications,
} from "~/features/notifications/notifications-link";
import { type PortalStatus, usePortal } from "~/features/portal/use-portal";

import { AR_URL, FAN_APP_URL } from "./links";
import { isActive, type NavGroup, type NavItem, navFor, phoneLabel, phoneTabs } from "./nav";
import { Sidebar } from "./sidebar";
import { SignInCard } from "./sign-in-card";

/**
 * The frame around every portal page: a sidebar of what this person may use
 * right now (see navFor), a top bar with the account, and a tab bar on phones.
 * Signed out, the menu stays and every page shows the sign-in card.
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

  // Signed out: the menu stays (links still change the page), the page itself is the sign-in card.
  const signedOut = !loading && !signedIn;

  return (
    <div className="grid min-h-dvh grid-cols-1 sm:grid-cols-[auto_minmax(0,1fr)]">
      <Sidebar
        groups={groups}
        pathname={pathname}
        portalName={isAdmin && step !== "READY" ? "admin portal" : "artist portal"}
        fallbackName={artist?.name}
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
      />

      <MobileTabs groups={groups} pathname={pathname} signedIn={signedIn} />

      <main className="min-w-0 pb-[var(--phone-bar-space)] sm:pb-12 sm:pl-(--side-w)">
        {signedOut ? <SignInCard /> : children}
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
}: {
  groups: NavGroup[];
  pathname: string;
  signedIn: boolean;
}) {
  const [open, setOpen] = useState(false);
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
      <header className="bg-bg/95 sticky top-0 z-30 flex h-14 items-center gap-2 border-b pr-3 pl-4 sm:hidden">
        <Link
          href="/"
          aria-label="Artist portal home"
          className="flex min-w-0 flex-1 items-center gap-2"
        >
          <BrandMark className="h-7" />
          <span className="marker text-primary-text truncate text-sm">artist portal</span>
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
      {left.length + right.length > 0 && (
        <PhoneTabBar left={left.map(tabOf)} right={right.map(tabOf)} arHref={AR_URL} />
      )}
      <SideMenuSheet
        open={open}
        onOpenChange={setOpen}
        home={{ href: "/", label: "Portal home", tagline: "artist portal" }}
        description="Every page in the artist portal"
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
