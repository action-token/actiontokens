"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Settings } from "lucide-react";
import { type ReactNode, useState } from "react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@bandcoin/ui/components/sheet";

import { AccountButton } from "~/features/account/account-button";
import { type PortalStatus, usePortal } from "~/features/portal/use-portal";

import { isActive, type NavGroup, navFor, phoneTabs } from "./nav";
import { Sidebar } from "./sidebar";

/**
 * The frame around every portal page: a sidebar of what this person may use
 * right now (see navFor), a top bar with the account, and a tab bar on phones.
 */
export function PortalShell({
  children,
  initialStatus,
}: {
  children: ReactNode;
  initialStatus?: PortalStatus;
}) {
  const pathname = usePathname();
  const { signedIn, step, isAdmin, artist } = usePortal(initialStatus);
  const groups = navFor({ signedIn, step, isAdmin });

  return (
    <div className="grid min-h-dvh grid-cols-1 sm:grid-cols-[72px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)]">
      <Sidebar
        groups={groups}
        pathname={pathname}
        portalName={isAdmin && step !== "READY" ? "admin portal" : "artist portal"}
        fallbackName={artist?.name}
      />

      <main className="min-w-0 pt-4 pb-24 sm:pt-0 sm:pb-12">{children}</main>

      <MobileTabs groups={groups} pathname={pathname} signedIn={signedIn} />
    </div>
  );
}

/** On phones the first links are tabs and the rest sit behind "More". */
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
  const { tabs, more } = phoneTabs(groups, signedIn);
  if (tabs.length === 0 && !more) return null;
  const tabClass =
    "text-fg-faint aria-[current=page]:text-fg grid min-w-0 flex-1 justify-items-center gap-0.5 py-2 text-[10px] font-medium";
  const hiddenActive = more && !tabs.some((entry) => isActive(entry, pathname));
  return (
    <>
      <nav
        aria-label="Tabs"
        className="bg-surface fixed inset-x-0 bottom-0 z-40 flex border-t pb-[env(safe-area-inset-bottom)] sm:hidden"
      >
        {tabs.map((entry) => (
          <Link
            key={entry.href}
            href={entry.href}
            aria-current={isActive(entry, pathname) ? "page" : undefined}
            className={tabClass}
          >
            <entry.icon className="size-5" />
            {entry.shortLabel ?? entry.label}
          </Link>
        ))}
        {more && (
          <button
            type="button"
            aria-current={hiddenActive ? "page" : undefined}
            onClick={() => setOpen(true)}
            className={tabClass}
          >
            <Menu className="size-5" />
            More
          </button>
        )}
      </nav>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[80dvh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Menu</SheetTitle>
            <SheetDescription className="sr-only">Every page in the artist portal</SheetDescription>
          </SheetHeader>
          <div className="grid gap-4 px-4 pb-6">
            <AccountButton />
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              aria-current={pathname.startsWith("/settings") ? "page" : undefined}
              className="text-fg-muted aria-[current=page]:bg-surface-2 aria-[current=page]:text-fg flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium"
            >
              <Settings className="size-[18px]" /> Settings
            </Link>
            {groups.map((group) => (
              <div key={group.title} className="grid gap-1">
                <span className="text-fg-faint text-[11px] font-semibold tracking-wider uppercase">
                  {group.title}
                </span>
                {group.items.map((entry) => (
                  <Link
                    key={entry.href}
                    href={entry.href}
                    onClick={() => setOpen(false)}
                    aria-current={isActive(entry, pathname) ? "page" : undefined}
                    className="text-fg-muted aria-[current=page]:bg-surface-2 aria-[current=page]:text-fg flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium"
                  >
                    <entry.icon className="size-[18px]" />
                    {entry.label}
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
