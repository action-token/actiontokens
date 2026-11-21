"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  LogIn,
  LogOut,
  ScanLine,
  Settings,
  Store,
} from "lucide-react";
import { signOut, useSession } from "next-auth/react";

import { Avatar, AvatarFallback, AvatarImage } from "@actiontokens/ui/components/avatar";
import { cn } from "@actiontokens/ui/lib/cn";
import { BrandMark } from "@actiontokens/ui/patterns/boot-screen";
import { useConnectWalletDialogStore } from "@actiontokens/wallet";

import { api } from "~/trpc/react";

import { NotificationBell } from "../notifications/notification-bell";
import { WalletSummary } from "../wallet/wallet-view";
import { AR_URL, FAN_APP_URL } from "./links";
import { isActive, type NavGroup } from "./nav";
import { ThemeControl } from "./theme-control";

const short = (address: string) => `${address.slice(0, 4)}…${address.slice(-4)}`;

/**
 * The portal sidebar, after the macOS sidebar: a floating glass panel with the app name, small
 * section labels, rows of icon and label (the current page tinted green), quick links to the
 * AR app and the marketplace, the balance, and the account and theme at the foot. Folded, or
 * below xl, it is a rail of icons; the chevron on its edge folds it. It takes no width itself:
 * the page pads by --side-w (shared theme.css), which follows the `side-island` class.
 */
export function Sidebar({
  groups,
  pathname,
  portalName,
  fallbackName,
  collapsed,
  onToggle,
}: {
  groups: NavGroup[];
  pathname: string;
  /** The line under the name: "Organizations", "Admin" */
  portalName: string;
  /** A name to show before the account loads (the organization's, from the server) */
  fallbackName?: string;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const session = useSession();
  const openAccount = useConnectWalletDialogStore((state) => state.setIsOpen);
  const signedIn = session.status === "authenticated";
  const me = api.account.me.useQuery(undefined, { enabled: signedIn });
  const name =
    me.data?.displayName ??
    me.data?.username ??
    fallbackName ??
    session.data?.user?.name ??
    "Your account";

  const quick = [
    { href: AR_URL, label: "Go to AR", hint: "Drops on map", icon: ScanLine, acid: false },
    { href: FAN_APP_URL, label: "Market", hint: "See as fans", icon: Store, acid: true },
  ];

  return (
    <aside
      aria-label="Main"
      data-collapsed={collapsed || undefined}
      className="side-island sticky top-0 z-40 hidden h-dvh w-0 sm:block"
    >
      <div className="pointer-events-none absolute inset-y-0 left-0 w-(--side-w) p-3">
        <div className="gx-panel pointer-events-auto flex h-full flex-col overflow-hidden">
          {/* ── open ── */}
          <div className={cn("h-full min-h-0 flex-col", collapsed ? "hidden" : "hidden xl:flex")}>
            <div className="flex shrink-0 items-center gap-2.5 px-4 pt-5 pb-3">
              <Link href="/" className="flex min-w-0 flex-1 items-center gap-2.5">
                <span className="gx-logo flex size-10 shrink-0 items-center justify-center rounded-[11px] bg-white">
                  <BrandMark className="h-7" />
                </span>
                <span className="min-w-0">
                  <span className="gx-brand block truncate">Action-Tokens</span>
                  <span className="gx-mono text-primary-text mt-1 flex items-center gap-1.5 truncate">
                    <span className="gx-live" aria-hidden />
                    {portalName}
                  </span>
                </span>
              </Link>
              {signedIn && <NotificationBell side="right" align="start" />}
            </div>

            <nav
              aria-label="Sections"
              className="min-h-0 flex-1 [scrollbar-width:thin] space-y-4 overflow-y-auto overscroll-contain px-3 py-2"
            >
              {groups.map((group) => (
                <div key={group.title}>
                  <p className="gx-section gx-mono">{`// ${group.title}`}</p>
                  <ul className="space-y-0.5">
                    {group.items.map((entry) => {
                      const active = isActive(entry, pathname);
                      const Icon = entry.icon;
                      return (
                        <li key={entry.href}>
                          <Link
                            href={entry.href}
                            aria-current={active ? "page" : undefined}
                            className="gx-item"
                          >
                            <span className="gx-tile">
                              <Icon className="size-4" strokeWidth={active ? 2.5 : 2} />
                            </span>
                            <span className="truncate">{entry.label}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}

              <div>
                <p className="gx-section gx-mono">{"// Launch"}</p>
                <div className="grid gap-2.5 px-1">
                  {quick.map(({ href, label, hint, icon: Icon, acid }) => (
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
                          <span className="gx-launch-title block">{label}</span>
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
            </nav>

            <div className="shrink-0 space-y-3 border-t border-[var(--gx-line)] p-3">
              <WalletSummary />
              {signedIn ? (
                <div className="flex items-center gap-2.5 px-1">
                  <button
                    type="button"
                    onClick={() => openAccount(true)}
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                  >
                    <span className="gx-ring shrink-0">
                      <Avatar className="size-8 border-2 border-[var(--gx-panel-b)]">
                        {me.data?.avatarUrl && <AvatarImage src={me.data.avatarUrl} alt="" />}
                        <AvatarFallback>{name.slice(0, 1).toUpperCase()}</AvatarFallback>
                      </Avatar>
                    </span>
                    <span className="min-w-0 leading-tight">
                      <span className="gx-brand block truncate !text-base">{name}</span>
                      {me.data?.walletAddress && (
                        <span className="text-fg-faint block truncate font-mono text-[11px]">
                          {short(me.data.walletAddress)}
                        </span>
                      )}
                    </span>
                  </button>
                  <Link
                    href="/settings"
                    aria-label="Settings"
                    title="Settings"
                    className="text-fg-muted hover:text-fg flex size-8 items-center justify-center rounded-full hover:bg-[var(--ap-fill)]"
                  >
                    <Settings className="size-4" />
                  </Link>
                  <button
                    type="button"
                    onClick={() => void signOut({ redirect: false })}
                    aria-label="Sign out"
                    title="Sign out"
                    className="text-fg-muted hover:text-fg flex size-8 items-center justify-center rounded-full hover:bg-[var(--ap-fill)]"
                  >
                    <LogOut className="size-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => openAccount(true)}
                  className="lp-cta !h-11 w-full justify-center !text-[1.15rem]"
                >
                  <LogIn className="size-4" /> Sign in
                </button>
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
            <Link href="/" aria-label="Portal home" className="mt-5 mb-3 shrink-0">
              <span className="gx-logo flex size-10 items-center justify-center rounded-[11px] bg-white">
                <BrandMark className="h-6" />
              </span>
            </Link>
            {signedIn && (
              <div className="mb-2 shrink-0">
                <NotificationBell side="right" align="start" />
              </div>
            )}
            <nav
              aria-label="Sections"
              className="flex min-h-0 flex-1 [scrollbar-width:none] flex-col items-center gap-1 overflow-y-auto px-2 py-2"
            >
              {groups.map((group, index) => (
                <div key={group.title} className="flex flex-col items-center gap-1">
                  {index > 0 && <span className="my-1.5 h-px w-6 bg-[var(--gx-line-strong)]" />}
                  {group.items.map((entry) => {
                    const active = isActive(entry, pathname);
                    const Icon = entry.icon;
                    return (
                      <Link
                        key={entry.href}
                        href={entry.href}
                        aria-label={entry.label}
                        title={entry.label}
                        aria-current={active ? "page" : undefined}
                        className="gx-rail-item text-fg-muted hover:text-fg flex size-10 items-center justify-center rounded-xl transition-colors hover:bg-[var(--ap-fill)]"
                      >
                        <Icon className="size-5" />
                      </Link>
                    );
                  })}
                </div>
              ))}
            </nav>
            <div className="shrink-0 pb-4">
              <button
                type="button"
                onClick={() => openAccount(true)}
                aria-label={signedIn ? name : "Sign in"}
                title={signedIn ? name : "Sign in"}
              >
                <Avatar className="size-9">
                  {me.data?.avatarUrl && <AvatarImage src={me.data.avatarUrl} alt="" />}
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
