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
          {/* ── open ── */}
          <div className={cn("h-full min-h-0 flex-col", collapsed ? "hidden" : "hidden xl:flex")}>
            <div className="flex shrink-0 items-center gap-2.5 px-4 pt-5 pb-3">
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

            <nav
              aria-label="Sections"
              className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-3 py-2 [scrollbar-width:thin]"
            >
              {groups.map((group) => (
                <div key={group.title}>
                  <p className="gx-section gx-mono">{`// ${group.title}`}</p>
                  <ul className="space-y-0.5">
                    {group.items.map((entry) => {
                      const Icon = entry.icon;
                      return (
                        <li key={entry.href}>
                          <DeckLink
                            href={entry.href}
                            external={entry.external}
                            active={entry.active}
                            className="gx-item"
                          >
                            <span className="gx-tile">
                              <Icon className="size-4" strokeWidth={entry.active ? 2.5 : 2} />
                            </span>
                            <span className="truncate">{entry.label}</span>
                          </DeckLink>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}

              {launch.length > 0 && (
                <div>
                  <p className="gx-section gx-mono">{"// Launch"}</p>
                  <div className="grid gap-2.5 px-1">
                    {launch.map(({ href, label: title, hint, icon: Icon, acid }) => (
                      <a
                        key={href}
                        href={href}
                        className={cn("gx-launch", acid && "gx-launch--acid")}
                      >
                        <span className="gx-launch-in">
                          <span className="gx-launch-icon">
                            <Icon className="size-4" strokeWidth={2.4} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="gx-launch-title block">{title}</span>
                            <span className="gx-mono text-fg-muted mt-1 block truncate !text-[9px] !tracking-[0.14em]">
                              {hint}
                            </span>
                          </span>
                          <ArrowUpRight className="text-fg-faint size-4 shrink-0" />
                        </span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </nav>

            <div className="shrink-0 space-y-3 border-t border-[var(--gx-line)] p-3">
              {balance}
              {account.state === "signedIn" ? (
                <div className="flex items-center gap-2.5 px-1">
                  <button
                    type="button"
                    onClick={account.onOpen}
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                  >
                    <span className="gx-ring shrink-0">
                      <Avatar className="size-8 border-2 border-[var(--gx-panel-b)]">
                        {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
                        <AvatarFallback>{name.slice(0, 1).toUpperCase()}</AvatarFallback>
                      </Avatar>
                    </span>
                    <span className="min-w-0 leading-tight">
                      <span className="gx-brand block truncate !text-base">{name}</span>
                      {account.address && (
                        <span className="text-fg-faint block truncate font-mono text-[11px]">
                          {short(account.address)}
                        </span>
                      )}
                    </span>
                  </button>
                  <Link
                    href={account.settingsHref}
                    aria-label="Settings"
                    title="Settings"
                    className="text-fg-muted hover:text-fg flex size-8 items-center justify-center rounded-full hover:bg-[var(--ap-fill)]"
                  >
                    <Settings className="size-4" />
                  </Link>
                  <button
                    type="button"
                    onClick={account.onSignOut}
                    aria-label="Sign out"
                    title="Sign out"
                    className="text-fg-muted hover:text-fg flex size-8 items-center justify-center rounded-full hover:bg-[var(--ap-fill)]"
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
              <div className="flex items-center justify-between px-1">
                <ThemeControl />
                <span className="gx-mono text-fg-faint">© {new Date().getFullYear()}</span>
              </div>
            </div>
          </div>

          {/* ── rail ── */}
          <div
            className={cn(
              "h-full min-h-0 flex-col items-center",
              collapsed ? "flex" : "flex xl:hidden",
            )}
          >
            <Link href={home.href} aria-label={home.label} className="mt-5 mb-3 shrink-0">
              <span className="gx-logo flex size-10 items-center justify-center rounded-[11px] bg-white">
                <BrandMark className="h-6" />
              </span>
            </Link>
            {railTools && (
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
          className="text-primary-text pointer-events-auto absolute top-1/2 right-0 z-50 hidden size-6 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--gx-line-strong)] bg-[var(--gx-panel-b)] shadow-[0_0_12px_var(--gx-glow-soft)] transition-transform hover:scale-110 xl:flex"
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
    <Link href={href} className="gx-vault group" aria-label="Wallet">
      <span className="gx-vault-in">
        <span className="gx-mono text-fg-muted flex items-center justify-between gap-2">
          Vault
          <span className="flex items-center gap-1.5">
            <span className="text-[var(--gx-acid-text)]">{code}</span>
            <span className="text-primary-text transition-transform group-hover:translate-x-0.5">
              →
            </span>
          </span>
        </span>
        <span className="gx-amount mt-2 block truncate">{amount ?? "…"}</span>
        {lines.length > 0 && (
          <span className="gx-mono text-fg-faint mt-2 flex flex-wrap gap-x-3 gap-y-1">
            {lines.map((line) => (
              <span key={line.label} className="flex items-center gap-1">
                {line.label}
                <span className="text-fg">{line.value ?? "…"}</span>
              </span>
            ))}
          </span>
        )}
      </span>
    </Link>
  );
}
