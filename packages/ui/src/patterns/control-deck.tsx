"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  LogIn,
  LogOut,
  Settings,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "../components/avatar";
import { cn } from "../lib/cn";
import { BrandMark } from "./boot-screen";
import type { SideAccount, SideGroup } from "./side-frame";
import { ThemeControl } from "./theme-control";

export type DeckLaunch = {
  href: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  /** The second accent (acid yellow) instead of neon */
  acid?: boolean;
};

const short = (address: string) => `${address.slice(0, 4)}…${address.slice(-4)}`;

/**
 * The Action-Tokens sidebar ("control deck"), shared by the org portal and the marketplace: a
 * floating neon-edged panel with the app name, `// section` labels, rows of icon tile and label
 * (the current page lit), launch cards to the other apps, the balance, and the account and theme
 * at the foot. Folded, or below xl, it is a rail of icons; the chevron on its edge folds it. It
 * takes no width itself: the page pads by --side-w (theme.css), which follows `side-island`.
 * Styles: gx.css. Each app passes its own links, header tools, launch cards and balance.
 */
export function ControlDeck({
  label = "Main",
  home,
  tagline,
  header = true,
  tools,
  railTools,
  groups,
  launch,
  balance,
  account,
  collapsed,
  onToggle,
}: {
  label?: string;
  /** Where the logo goes, and its accessible name */
  home: { href: string; label: string };
  /** The line under the name: "Organization portal", "Marketplace" */
  tagline: string;
  /** Off when the app has its own top bar (the marketplace's notch carries the logo, search and bell) */
  header?: boolean;
  /** Round buttons beside the name (search, the bell) */
  tools?: ReactNode;
  /** The same tools for the folded rail */
  railTools?: ReactNode;
  groups: SideGroup[];
  launch: DeckLaunch[];
  balance?: ReactNode;
  account: SideAccount;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const signedIn = account.state === "signedIn";
  const name = account.state === "signedIn" ? account.name : "";
  const avatarUrl = account.state === "signedIn" ? account.avatarUrl : null;
  const open = () => {
    if (account.state === "signedIn") account.onOpen();
    else if (account.state === "signedOut") account.onSignIn();
  };

  return (
    <aside
      aria-label={label}
      data-collapsed={collapsed || undefined}
      className="side-island sticky top-0 z-40 hidden h-dvh w-0 sm:block"
    >
      <div className="pointer-events-none absolute inset-y-0 left-0 w-(--side-w) p-3">
        <div className="gx-panel pointer-events-auto flex h-full flex-col overflow-hidden">
          {/* ── open: as in docs/mockups/home.html ── */}
          <div className={cn("h-full min-h-0 flex-col", collapsed ? "hidden" : "hidden xl:flex")}>
            {header && (
              <div className="flex shrink-0 items-center gap-2.5 px-4 pt-5 pb-1">
                <Link
                  href={home.href}
                  aria-label={home.label}
                  className="flex min-w-0 flex-1 items-center gap-2.5"
                >
                  <span className="gx-logo flex size-10 shrink-0 items-center justify-center rounded-[11px] bg-white">
                    <BrandMark className="h-7" />
                  </span>
                  <span className="min-w-0">
                    <span className="gx-brand block truncate">Action-Tokens</span>
                    <span className="gx-mono text-primary-text mt-1 flex items-center gap-1.5 truncate">
                      <span className="gx-live" aria-hidden />
                      {tagline}
                    </span>
                  </span>
                </Link>
                {tools && <div className="flex shrink-0 items-center gap-1.5">{tools}</div>}
              </div>
            )}

            {/* who you are, then your balance */}
            <div className="gx-me">
              {account.state === "signedIn" ? (
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={account.onOpen}
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                  >
                    <span className="gx-me-av">
                      {avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- avatars come from many hosts
                        <img src={avatarUrl} alt="" />
                      ) : (
                        name.slice(0, 2).toUpperCase()
                      )}
                    </span>
                    <span className="min-w-0">
                      <strong className="gx-me-name">{name}</strong>
                      {/* the address under the name, unless the name already is the address */}
                      {account.address && !name.startsWith(account.address.slice(0, 3)) && (
                        <span className="gx-me-sub">{short(account.address)}</span>
                      )}
                    </span>
                  </button>
                  <Link
                    href={account.settingsHref}
                    aria-label="Settings"
                    title="Settings"
                    className="gx-me-btn"
                  >
                    <Settings className="size-4" />
                  </Link>
                  <button
                    type="button"
                    onClick={account.onSignOut}
                    aria-label="Sign out"
                    title="Sign out"
                    className="gx-me-btn"
                  >
                    <LogOut className="size-4" />
                  </button>
                </div>
              ) : account.state === "signedOut" ? (
                <button
                  type="button"
                  onClick={account.onSignIn}
                  className="lp-cta !h-11 w-full justify-center !text-[1.15rem]"
                >
                  <LogIn className="size-4" /> Sign in
                </button>
              ) : (
                <div className="h-11 animate-pulse rounded-xl bg-[var(--ap-fill)]" />
              )}
              {balance && <div className="mt-2.5">{balance}</div>}
            </div>

            <nav aria-label="Sections" className="gx-nav">
              {groups.map((group) => (
                <div key={group.title}>
                  <p className="gx-sec">{group.title}</p>
                  <ul>
                    {group.items.map((entry) => {
                      const Icon = entry.icon;
                      return (
                        <li key={entry.href}>
                          <DeckLink
                            href={entry.href}
                            external={entry.external}
                            active={entry.active}
                            className="gx-row"
                          >
                            <Icon strokeWidth={2} />
                            <span className="gx-lbl truncate">{entry.label}</span>
                            {entry.meta && <span className="gx-meta">{entry.meta}</span>}
                          </DeckLink>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}

              {launch.length > 1 && (
                <div>
                  <p className="gx-sec">Launch</p>
                  <ul>
                    {launch.slice(1).map(({ href, label: title, hint, icon: Icon }) => (
                      <li key={href}>
                        <a href={href} title={hint} className="gx-row">
                          <Icon strokeWidth={2} />
                          <span className="gx-lbl truncate">{title}</span>
                          <span className="gx-meta">↗</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex items-center justify-between px-0.5 pt-4">
                <ThemeControl />
                <span className="gx-mono text-fg-faint">© {new Date().getFullYear()}</span>
              </div>
            </nav>

            {/* the big ACT button (the first launch target, AR) and the fold */}
            <div className="gx-foot">
              {launch[0] && (
                <a href={launch[0].href} className="gx-act" title={launch[0].hint}>
                  <b>ACT</b>
                  <small>{launch[0].label}</small>
                  <kbd>
                    <ArrowUpRight className="size-4" strokeWidth={2.6} />
                  </kbd>
                </a>
              )}
              <button
                type="button"
                onClick={onToggle}
                className="gx-collapse"
                aria-label="Collapse sidebar"
                title="Collapse sidebar"
                aria-expanded
              >
                <ChevronLeft className="size-4" strokeWidth={2.4} />
              </button>
            </div>
          </div>

          {/* ── rail ── */}
          <div
            className={cn(
              "h-full min-h-0 flex-col items-center",
              collapsed ? "flex" : "flex xl:hidden",
            )}
          >
            {header ? (
              <Link href={home.href} aria-label={home.label} className="mt-5 mb-3 shrink-0">
                <span className="gx-logo flex size-10 items-center justify-center rounded-[11px] bg-white">
                  <BrandMark className="h-6" />
                </span>
              </Link>
            ) : (
              <div className="h-3 shrink-0" />
            )}
            {header && railTools && (
              <div className="mb-2 flex shrink-0 flex-col items-center gap-1.5">{railTools}</div>
            )}
            <nav
              aria-label="Sections"
              className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto px-2 py-2 [scrollbar-width:none]"
            >
              {groups.map((group, index) => (
                <div key={group.title} className="flex flex-col items-center gap-1">
                  {index > 0 && <span className="my-1.5 h-px w-6 bg-[var(--gx-line-strong)]" />}
                  {group.items.map((entry) => {
                    const Icon = entry.icon;
                    return (
                      <DeckLink
                        key={entry.href}
                        href={entry.href}
                        external={entry.external}
                        active={entry.active}
                        title={entry.label}
                        className="gx-rail-item text-fg-muted hover:text-fg flex size-10 items-center justify-center rounded-xl transition-colors hover:bg-[var(--ap-fill)]"
                      >
                        <Icon className="size-5" />
                      </DeckLink>
                    );
                  })}
                </div>
              ))}
            </nav>
            <div className="shrink-0 pb-4">
              <button
                type="button"
                onClick={open}
                aria-label={signedIn ? name : "Sign in"}
                title={signedIn ? name : "Sign in"}
              >
                <Avatar className="size-9">
                  {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
                  <AvatarFallback>{signedIn ? name.slice(0, 1).toUpperCase() : "?"}</AvatarFallback>
                </Avatar>
              </button>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onToggle}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          className={cn(
            "text-primary-text pointer-events-auto absolute top-1/2 right-0 z-50 hidden size-6 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--gx-line-strong)] bg-[var(--gx-panel-b)] shadow-[0_0_12px_var(--gx-glow-soft)] transition-transform hover:scale-110",
            collapsed && "xl:flex",
          )}
        >
          {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronLeft className="size-3.5" />}
        </button>
      </div>
    </aside>
  );
}

/** A sidebar row: a client-side Link, or a plain link for addresses outside the app. */
function DeckLink({
  href,
  external,
  active,
  title,
  className,
  children,
}: {
  href: string;
  external?: boolean;
  active: boolean;
  title?: string;
  className: string;
  children: ReactNode;
}) {
  const shared = {
    "aria-current": active ? ("page" as const) : undefined,
    "aria-label": title,
    title,
    className,
  };
  return external ? (
    <a href={href} {...shared}>
      {children}
    </a>
  ) : (
    <Link href={href} {...shared}>
      {children}
    </Link>
  );
}

/** The balance card at the foot of the deck: the main amount big, the other currencies small. */
export function DeckVault({
  href,
  code,
  amount,
  lines = [],
}: {
  href: string;
  code: string;
  /** null while loading */
  amount: ReactNode | null;
  lines?: { label: string; value: ReactNode | null }[];
}) {
  return (
    <Link href={href} className="gx-wallet group" aria-label="Wallet">
      <span className="flex items-baseline gap-1.5">
        <span className="gx-wallet-amount truncate">{amount ?? "…"}</span>
        <span className="gx-wallet-code">{code}</span>
        <span className="text-primary-text ml-auto text-xs transition-transform group-hover:translate-x-0.5">
          →
        </span>
      </span>
      {lines.length > 0 && (
        <span className="gx-wallet-lines">
          {lines.map((line) => (
            <span key={line.label} className="flex items-center gap-1">
              {line.label}
              <span className="text-fg">{line.value ?? "…"}</span>
            </span>
          ))}
        </span>
      )}
    </Link>
  );
}
