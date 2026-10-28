"use client";

import { Home, Layers, ListMusic, MapPin, Music, Search, Store, Trophy } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useState } from "react";

import { cn } from "@bandcoin/ui/lib/cn";
import { BrandMark } from "@bandcoin/ui/patterns/boot-screen";

import { AccountButton } from "~/features/account/account-button";
import { PlayerBar } from "~/features/player/player-bar";
import { usePlayer } from "~/features/player/player-store";

import { ContextPanel } from "./context-panel";
import { hasContextPanel } from "./panel-rule";

const AR_URL = process.env.NEXT_PUBLIC_AR_URL ?? "https://ar.bandcoin.io";

const NAV = [
  { href: "/", icon: Home, label: "Home" },
  { href: "/music", icon: Music, label: "Music" },
  { href: "/marketplace", icon: Store, label: "Marketplace" },
  { href: "/bounties", icon: Trophy, label: "Bounties" },
  { href: AR_URL, icon: MapPin, label: "AR pins", external: true },
] as const;

const LIBRARY = [
  { href: "/collection", icon: Layers, label: "My collection" },
  { href: "/playlists", icon: ListMusic, label: "Playlists" },
] as const;

/** Bottom tabs on phones (the sidebar's main entries). */
const MOBILE_NAV = [NAV[0], NAV[1], NAV[2], NAV[3], LIBRARY[0]];

const isActive = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname.startsWith(href);

/**
 * The frame around every fan page: sidebar, top bar with search and account,
 * a right panel that changes with the page, and the player at the bottom.
 * On phones the sidebar becomes a bottom tab bar under the player.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const hasTrack = usePlayer((state) => state.queue.length > 0);
  const panel = hasContextPanel(pathname, hasTrack);

  return (
    <div
      className={cn(
        "grid min-h-dvh grid-cols-1 sm:grid-cols-[72px_minmax(0,1fr)]",
        panel ? "xl:grid-cols-[220px_minmax(0,1fr)_288px]" : "xl:grid-cols-[220px_minmax(0,1fr)]",
      )}
    >
      <nav
        aria-label="Main"
        className="bg-surface sticky top-0 hidden h-dvh content-start gap-1 overflow-y-auto border-r px-3 py-4 sm:grid"
      >
        <Link
          href="/"
          className="flex items-center justify-center gap-2 pb-5 xl:justify-start xl:px-2"
        >
          <BrandMark className="size-[28px]" />
          <span className="font-display hidden text-[15px] font-extrabold tracking-tight xl:inline">
            Bandcoin
          </span>
        </Link>
        {NAV.map((entry) => (
          <NavLink
            key={entry.label}
            {...entry}
            active={!("external" in entry) && isActive(pathname, entry.href)}
          />
        ))}
        <div className="bg-border mx-2 my-3 h-px" />
        <span className="text-fg-faint hidden px-3 pb-1 text-[11px] font-semibold tracking-wider uppercase xl:block">
          Library
        </span>
        {LIBRARY.map((entry) => (
          <NavLink key={entry.label} {...entry} active={isActive(pathname, entry.href)} />
        ))}
      </nav>

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
          {MOBILE_NAV.map(({ href, icon: Icon, label }) => (
            <Link
              key={label}
              href={href}
              aria-current={isActive(pathname, href) ? "page" : undefined}
              className="text-fg-faint aria-[current=page]:text-fg grid justify-items-center gap-0.5 py-2 text-[10px] font-medium"
            >
              <Icon className="size-5" />
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}

function NavLink({
  href,
  icon: Icon,
  label,
  active,
  external,
}: {
  href: string;
  icon: typeof Home;
  label: string;
  active: boolean;
  external?: boolean;
}) {
  const className = cn(
    "text-fg-muted hover:bg-surface-2 hover:text-fg flex h-10 w-full items-center justify-center gap-3 rounded-sm text-sm font-medium transition-colors xl:justify-start xl:px-3",
    active && "bg-surface-3 text-fg",
  );
  const content = (
    <>
      <Icon className="size-[18px] shrink-0" />
      <span className="hidden xl:inline">{label}</span>
    </>
  );
  return external ? (
    <a href={href} className={className} title={label}>
      {content}
    </a>
  ) : (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={className}
      title={label}
    >
      {content}
    </Link>
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
