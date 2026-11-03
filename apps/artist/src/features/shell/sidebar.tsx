"use client";

import {
  ArrowUpRight,
  LogIn,
  LogOut,
  Monitor,
  Moon,
  ScanLine,
  Settings,
  Store,
  Sun,
} from "lucide-react";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@bandcoin/ui/components/avatar";
import { cn } from "@bandcoin/ui/lib/cn";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { BrandMark } from "@bandcoin/ui/patterns/boot-screen";
import { copyrightLine, INFO_LINKS, SOCIALS } from "@bandcoin/ui/patterns/site-links";
import { abbreviateAddress } from "@bandcoin/utils/address";
import { useConnectWalletDialogStore } from "@bandcoin/wallet";

import { api } from "~/trpc/react";

import { NotificationBell } from "../notifications/notification-bell";
import { WalletSidebarCard } from "../wallet/wallet-view";
import { AR_URL, FAN_APP_URL } from "./links";
import { isActive, type NavGroup, type NavItem } from "./nav";

/**
 * The portal sidebar, laid out like Wadzzo's brand portal: the name on top, a
 * scrolling body (the sections, then tiles to the other Bandcoin apps) between
 * dashed rules, and a fixed footer with who is signed in, the theme, the
 * socials, and the info pages with the copyright (as bandfan had). Below
 * the xl breakpoint it is an icon rail.
 */
export function Sidebar({
  groups,
  pathname,
  portalName,
  fallbackName,
}: {
  groups: NavGroup[];
  pathname: string;
  /** The handwritten line under the name: "artist portal", "admin portal" */
  portalName: string;
  /** A name to show before the account loads (the artist's, from the server) */
  fallbackName?: string;
}) {
  return (
    <nav
      aria-label="Main"
      className="bg-surface sticky top-0 hidden h-dvh grid-rows-[auto_minmax(0,1fr)_auto] border-r sm:grid"
    >
      <div>
        <div className="flex h-16 min-w-0 items-center justify-center gap-2 px-3 xl:justify-between xl:px-4">
          <Link href="/" aria-label="Portal home" className="flex min-w-0 items-center gap-2">
            <span className="bg-fg text-bg flex size-9 shrink-0 -rotate-3 items-center justify-center rounded-lg">
              <BrandMark className="size-5" />
            </span>
            <span className="hidden min-w-0 leading-none xl:block">
              <span className="display block truncate text-lg">Bandcoin</span>
              <span className="marker text-primary-text mt-0.5 block text-[11px]">
                {portalName}
              </span>
            </span>
          </Link>
          <SignedInOnly>
            <NotificationBell side="right" align="start" className="hidden xl:flex" />
          </SignedInOnly>
        </div>
        {/* On the icon rail the bell sits under the logo. */}
        <SignedInOnly>
          <div className="flex justify-center pb-2 xl:hidden">
            <NotificationBell side="right" align="start" />
          </div>
        </SignedInOnly>
      </div>

      <div className="border-fg/25 relative min-h-0 [scrollbar-width:none] space-y-3 overflow-y-auto overscroll-contain border-y-2 border-dashed p-2 xl:p-3">
        {groups.map((group, index) => (
          <div key={group.title}>
            {index > 0 && (
              <div className="border-fg/25 mb-3 border-t-2 border-dashed" aria-hidden />
            )}
            <p className="marker text-fg-muted mb-1 hidden px-2 text-[11px] xl:block">
              *{group.title.toLowerCase()}*
            </p>
            <ul className="space-y-0.5">
              {group.items.map((entry) => (
                <li key={entry.href}>
                  <SideLink entry={entry} active={isActive(entry, pathname)} />
                </li>
              ))}
            </ul>
          </div>
        ))}

        <WalletSidebarCard />

        <div className="grid gap-1.5">
          <LaunchTile
            href={AR_URL}
            title="Go to AR"
            hint="Your drops on the map"
            icon={ScanLine}
            className="bg-fg text-bg"
          />
          <LaunchTile
            href={FAN_APP_URL}
            title="Bandcoin"
            hint="See it as fans do"
            icon={Store}
            className="bg-primary text-primary-foreground"
          />
        </div>
      </div>

      <div className="grid gap-2 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] xl:p-3">
        <ProfileRow fallbackName={fallbackName} />
        <div className="hidden items-center justify-between gap-2 xl:flex">
          <ThemeSwitch />
          <div className="flex gap-1">
            {SOCIALS.map((social) => (
              <a
                key={social.href}
                href={social.href}
                target="_blank"
                rel="noreferrer"
                aria-label={social.label}
                title={social.label}
                className="bg-fg text-bg flex size-6 items-center justify-center rounded-full transition-transform hover:scale-110"
              >
                <social.icon className="size-3" />
              </a>
            ))}
          </div>
        </div>
        {/* info pages and the copyright share the last row, as in Wadzzo */}
        <div className="border-fg/20 hidden items-center justify-between gap-2 border-t-2 border-dashed pt-2 text-[10px] leading-none whitespace-nowrap xl:flex">
          <div className="text-fg-muted flex gap-1.5 font-medium">
            {INFO_LINKS.map((info) => (
              <a
                key={info.path}
                href={`${FAN_APP_URL}${info.path}`}
                target="_blank"
                rel="noreferrer"
                className="hover:text-fg hover:underline"
              >
                {info.label}
              </a>
            ))}
          </div>
          <span className="text-fg-faint font-medium">{copyrightLine()}</span>
        </div>
      </div>
    </nav>
  );
}

function SideLink({ entry, active }: { entry: NavItem; active: boolean }) {
  const Icon = entry.icon;
  return (
    <Link
      href={entry.href}
      title={entry.label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "display flex h-8 items-center justify-center gap-2 rounded-lg border-2 border-transparent text-[12.5px] transition-[background-color,transform] duration-150 xl:justify-start xl:px-2.5",
        active
          ? "bg-primary text-primary-foreground border-fg -rotate-1 shadow-[2px_3px_0_0_var(--color-fg)]"
          : "text-fg-muted hover:bg-surface-2 hover:text-fg hover:translate-x-0.5",
      )}
    >
      <Icon className="size-4 shrink-0" strokeWidth={2.4} />
      <span className="hidden truncate xl:inline">{entry.label}</span>
    </Link>
  );
}

/** A big tile that opens another Bandcoin app in a new tab; a round icon on the rail. */
function LaunchTile({
  href,
  title,
  hint,
  icon: Icon,
  className,
}: {
  href: string;
  title: string;
  hint: string;
  icon: typeof ScanLine;
  className: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={title}
      className={cn(
        "group border-fg flex h-10 min-w-0 items-center justify-center gap-2.5 rounded-lg border-2 px-2 transition-transform duration-200 hover:-translate-y-0.5 hover:-rotate-1 xl:justify-start xl:px-3",
        className,
      )}
    >
      <Icon className="size-4 shrink-0" strokeWidth={2.4} />
      <span className="hidden min-w-0 flex-1 leading-tight xl:block">
        <span className="display block truncate text-[13px]">{title}</span>
        <span className="block truncate text-[10px] font-semibold opacity-70">{hint}</span>
      </span>
      <ArrowUpRight
        className="hidden size-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 xl:block"
        strokeWidth={2.8}
      />
      <span className="sr-only">, opens in a new tab</span>
    </a>
  );
}

/** Who is signed in (opens the wallet dialog), then settings and sign out, as in Wadzzo's footer. */
function ProfileRow({ fallbackName }: { fallbackName?: string }) {
  const session = useSession();
  const openAccount = useConnectWalletDialogStore((state) => state.setIsOpen);
  const me = api.account.me.useQuery(undefined, {
    enabled: session.status === "authenticated",
  });

  if (session.status === "loading")
    return <Skeleton className="h-9 rounded-lg" aria-label="Loading your account" />;

  if (session.status === "unauthenticated") {
    return (
      <button
        type="button"
        onClick={() => openAccount(true)}
        title="Sign in"
        className="bg-fg text-bg display flex h-11 items-center justify-center gap-2 rounded-xl text-base"
      >
        <LogIn className="size-4" /> <span className="hidden xl:inline">Sign in</span>
      </button>
    );
  }

  const name =
    me.data?.displayName ??
    me.data?.username ??
    fallbackName ??
    session.data?.user?.name ??
    "Your account";
  const address = me.data?.walletAddress ?? undefined;

  return (
    <div className="bg-fg text-bg flex items-center justify-center gap-1 rounded-lg p-1">
      <button
        type="button"
        onClick={() => openAccount(true)}
        title="Account & wallets"
        className="group flex min-w-0 items-center gap-2 rounded-lg p-0.5 text-left xl:flex-1"
      >
        <Avatar className="border-bg size-7 border-2">
          {me.data?.avatarUrl && <AvatarImage src={me.data.avatarUrl} alt="" />}
          <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
            {name.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <span className="hidden min-w-0 flex-1 leading-tight xl:block">
          <span className="display block truncate text-[13px] group-hover:underline">{name}</span>
          {address && (
            <span className="block truncate font-mono text-[10px] opacity-60">
              {abbreviateAddress(address)}
            </span>
          )}
        </span>
      </button>
      <Link
        href="/settings"
        aria-label="Settings"
        title="Settings"
        className="hover:bg-bg/15 hidden size-6 shrink-0 items-center justify-center rounded-lg opacity-80 transition-colors hover:opacity-100 xl:flex"
      >
        <Settings className="size-3.5" strokeWidth={2.6} />
      </Link>
      <button
        type="button"
        onClick={() => void signOut({ redirect: false })}
        aria-label="Sign out"
        title="Sign out"
        className="bg-bg text-fg hidden size-6 shrink-0 items-center justify-center rounded-lg transition-transform duration-200 hover:scale-105 xl:flex"
      >
        <LogOut className="size-3.5" strokeWidth={2.6} />
      </button>
    </div>
  );
}

const THEMES = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "system", label: "System", icon: Monitor },
] as const;

const useMounted = () =>
  useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );

/** Icon-only theme picker, as in Wadzzo's sidebar footer. */
function ThemeSwitch() {
  const { theme: stored, setTheme } = useTheme();
  // next-themes knows the theme only on the client; render nothing selected until then.
  const theme = useMounted() ? stored : undefined;
  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="bg-surface-2 flex gap-0.5 rounded-full p-0.5"
    >
      {THEMES.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={theme === option.id}
          aria-label={option.label}
          title={option.label}
          onClick={() => setTheme(option.id)}
          className={cn(
            "flex size-6 items-center justify-center rounded-full transition-colors",
            theme === option.id ? "bg-fg text-bg" : "text-fg-muted hover:text-fg",
          )}
        >
          <option.icon className="size-3.5" strokeWidth={2.4} />
        </button>
      ))}
    </div>
  );
}

/** Renders its children only for a signed-in person (the bell has nothing to show otherwise). */
function SignedInOnly({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  return status === "authenticated" ? children : null;
}
