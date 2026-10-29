"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { type ReactNode, useState } from "react";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@bandcoin/ui/components/sheet";
import { cn } from "@bandcoin/ui/lib/cn";
import { BrandMark } from "@bandcoin/ui/patterns/boot-screen";

import { ThemeSwitch } from "~/components/theme-switch";
import { AccountButton } from "~/features/account/account-button";
import { usePortal } from "~/features/portal/use-portal";

import { isActive, type NavGroup, navFor, phoneTabs } from "./nav";

/**
 * The frame around every portal page: a sidebar of what this person may use
 * right now (see navFor), a top bar with the account, and a tab bar on phones.
 */
export function PortalShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { signedIn, step, isAdmin } = usePortal();
  const groups = navFor({ signedIn, step, isAdmin });

  return (
    <div className="grid min-h-dvh grid-cols-1 sm:grid-cols-[72px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)]">
      <nav
        aria-label="Main"
        className="bg-surface sticky top-0 hidden h-dvh grid-rows-[auto_minmax(0,1fr)_auto] gap-2 border-r px-3 py-3 sm:grid"
      >
        <Link href="/" className="flex items-center justify-center gap-2 pb-3 xl:justify-start xl:px-2">
          <BrandMark className="size-[28px]" />
          <span className="font-display hidden text-[15px] font-extrabold tracking-tight xl:inline">
            Bandcoin <span className="text-primary-text">Artists</span>
          </span>
        </Link>
        <div className="grid min-w-0 content-start gap-0.5 overflow-y-auto">
          {groups.map((group, index) => (
            <SidebarGroup key={group.title} group={group} pathname={pathname} divider={index > 0} />
          ))}
        </div>
        <div className="hidden justify-center xl:flex">
          <ThemeSwitch />
        </div>
      </nav>

      <div className="flex min-w-0 flex-col">
        <header className="bg-bg/85 sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b px-4 backdrop-blur sm:justify-end sm:px-6">
          <Link href="/" className="sm:hidden" aria-label="Home">
            <BrandMark className="size-7" />
          </Link>
          <AccountButton />
        </header>
        <main className="flex-1 pb-24 sm:pb-12">{children}</main>
      </div>

      <MobileTabs groups={groups} pathname={pathname} />
    </div>
  );
}

function SidebarGroup({ group, pathname, divider }: { group: NavGroup; pathname: string; divider: boolean }) {
  return (
    <>
      {divider && <div className="bg-border mx-2 my-2 h-px xl:hidden" />}
      <span className="text-fg-faint hidden px-3 pt-2.5 pb-0.5 text-[11px] font-semibold tracking-wider uppercase xl:block">
        {group.title}
      </span>
      {group.items.map((entry) => {
        const active = isActive(entry, pathname);
        return (
          <Link
            key={entry.href}
            href={entry.href}
            title={entry.label}
            aria-current={active ? "page" : undefined}
            className={cn(
              "text-fg-muted hover:bg-surface-2 hover:text-fg flex h-9 w-full items-center justify-center gap-3 rounded-lg border-2 border-transparent text-sm font-medium transition-colors xl:justify-start xl:px-3",
              active &&
                "bg-primary text-primary-foreground border-fg hover:bg-primary hover:text-primary-foreground font-semibold shadow-[2px_3px_0_0_var(--color-fg)]",
            )}
          >
            <entry.icon className="size-[18px] shrink-0" />
            <span className="hidden xl:inline">{entry.label}</span>
          </Link>
        );
      })}
    </>
  );
}

/** On phones the first links are tabs and the rest sit behind "More". */
function MobileTabs({ groups, pathname }: { groups: NavGroup[]; pathname: string }) {
  const [open, setOpen] = useState(false);
  const { tabs, more } = phoneTabs(groups);
  if (tabs.length < 2 && !more) return null;
  const tabClass = "text-fg-faint aria-[current=page]:text-fg grid min-w-0 flex-1 justify-items-center gap-0.5 py-2 text-[10px] font-medium";
  const hiddenActive = more && !tabs.some((entry) => isActive(entry, pathname));
  return (
    <>
      <nav aria-label="Tabs" className="bg-surface fixed inset-x-0 bottom-0 z-40 flex border-t pb-[env(safe-area-inset-bottom)] sm:hidden">
        {tabs.map((entry) => (
          <Link key={entry.href} href={entry.href} aria-current={isActive(entry, pathname) ? "page" : undefined} className={tabClass}>
            <entry.icon className="size-5" />
            {entry.label}
          </Link>
        ))}
        {more && (
          <button type="button" aria-current={hiddenActive ? "page" : undefined} onClick={() => setOpen(true)} className={tabClass}>
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
          <div className="grid gap-4 px-4 pb-6" onClick={() => setOpen(false)}>
            {groups.map((group) => (
              <div key={group.title} className="grid gap-1">
                <span className="text-fg-faint text-[11px] font-semibold tracking-wider uppercase">{group.title}</span>
                {group.items.map((entry) => (
                  <Link
                    key={entry.href}
                    href={entry.href}
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
