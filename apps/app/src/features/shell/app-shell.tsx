"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useState } from "react";

import { cn } from "@bandcoin/ui/lib/cn";
import { BrandMark } from "@bandcoin/ui/patterns/boot-screen";

import { AccountButton } from "~/features/account/account-button";
import { PlayerBar } from "~/features/player/player-bar";

import { ContextPanel } from "./context-panel";
import { isActive, MOBILE_TABS } from "./nav";
import { hasContextPanel } from "./panel-rule";
import { Sidebar } from "./sidebar";

/**
 * The frame around every fan page: sidebar, top bar with search and account,
 * a right panel that changes with the page, and the player at the bottom.
 * On phones the sidebar becomes a bottom tab bar under the player.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const panel = hasContextPanel(pathname);

  return (
    <div
      className={cn(
        "grid min-h-dvh grid-cols-1 sm:grid-cols-[72px_minmax(0,1fr)]",
        panel ? "xl:grid-cols-[220px_minmax(0,1fr)_288px]" : "xl:grid-cols-[220px_minmax(0,1fr)]",
      )}
    >
      <Sidebar />

      <div className="flex min-w-0 flex-col">
        <header className="bg-bg/85 sticky top-0 z-30 flex h-16 items-center gap-3 border-b px-4 backdrop-blur sm:px-6">
          <Link href="/" className="sm:hidden" aria-label="Home">
            <BrandMark className="size-7" />
          </Link>
          <SearchBox />
          <AccountButton />
        </header>
        <main className="flex-1 pb-36 sm:pb-24">{children}</main>
      </div>

      {panel && (
        <aside
          aria-label="For this page"
          className="bg-surface sticky top-0 hidden h-dvh overflow-y-auto border-l p-4 xl:block"
        >
          <ContextPanel />
        </aside>
      )}

      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 sm:left-[72px] xl:left-[220px]",
          panel && "xl:right-[288px]",
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

/** Searches the marketplace (songs, artists, items). */
function SearchBox() {
  const router = useRouter();
  const [text, setText] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const query = text.trim();
    router.push(query ? `/marketplace?search=${encodeURIComponent(query)}` : "/marketplace");
  };
  return (
    <form role="search" onSubmit={submit} className="min-w-0 flex-1">
      <label className="bg-surface text-fg-faint focus-within:border-primary-text flex h-10 max-w-md items-center gap-2 rounded-full border px-4 text-sm">
        <Search className="size-4 shrink-0" />
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Search songs, artists, items"
          aria-label="Search"
          className="text-fg placeholder:text-fg-faint min-w-0 flex-1 bg-transparent outline-none"
        />
      </label>
    </form>
  );
}
