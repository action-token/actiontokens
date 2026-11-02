"use client";

import { ArrowUpRight, LogIn, Mic2, Plus, ScanLine, Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Fragment, Suspense } from "react";

import { Button } from "@bandcoin/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@bandcoin/ui/components/dropdown-menu";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { cn } from "@bandcoin/ui/lib/cn";
import { BrandMark } from "@bandcoin/ui/patterns/boot-screen";
import { copyrightLine, INFO_LINKS, SOCIALS } from "@bandcoin/ui/patterns/site-links";
import { abbreviateAddress } from "@bandcoin/utils/address";
import { useConnectWalletDialogStore } from "@bandcoin/wallet";

import { Money } from "~/components/money";
import { AccountMenuItems } from "~/features/account/account-button";
import { api } from "~/trpc/react";

import { Avatar } from "./context-panel";
import { AR_URL, ARTIST_URL, artistEntry, GROUPS, isActive, type NavItem } from "./nav";
import { ResizeHandle } from "./resize-handle";
import { SearchBox } from "./search-box";
import { SidebarTheme } from "./sidebar-theme";

/**
 * The desktop sidebar: search, links in groups (the page you're on is filled in
 * the brand yellow), and your account at the bottom with your balance, which
 * opens the account menu, and a Recharge button, then the theme, socials, info pages and copyright. Below the xl breakpoint it is an icon rail.
 */
export function Sidebar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="bg-surface relative sticky top-0 hidden h-dvh min-w-0 grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto] gap-2 border-r px-3 py-3 sm:grid"
    >
      <div className="grid min-w-0 gap-3 pb-3">
        <Link href="/" className="flex items-center justify-center gap-2 xl:justify-start xl:px-2">
          <BrandMark className="size-[28px]" />
          <span className="font-display hidden text-[15px] font-extrabold tracking-tight xl:inline">
            Bandcoin
          </span>
        </Link>
        {/* The marketplace has its own search beside the filters; one box is enough. */}
        {pathname !== "/marketplace" && (
          <>
            <SearchBox className="hidden xl:block" />
            <Link
              href="/marketplace"
              aria-label="Search"
              title="Search"
              className="bg-surface-2 text-fg-muted hover:text-fg mx-auto flex size-9 items-center justify-center rounded-full xl:hidden"
            >
              <Search className="size-4" />
            </Link>
          </>
        )}
      </div>

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-0.5 overflow-y-auto">
        {/* useSearchParams needs a boundary; links render right away, the highlight follows */}
        <Suspense fallback={<Links tab={null} />}>
          <LinksWithTab />
        </Suspense>
      </div>

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
        <LaunchTiles />
        <AccountCard />
        <SiteFooter />
      </div>
      <ResizeHandle side="left" label="Resize the sidebar" />
    </nav>
  );
}

function LinksWithTab() {
  return <Links tab={useSearchParams().get("tab")} />;
}

function Links({ tab }: { tab: string | null }) {
  const pathname = usePathname();
  return (
    <>
      {GROUPS.map((group, index) => (
        <Fragment key={group.title}>
          {index > 0 && <div className="bg-border mx-2 my-2 h-px xl:hidden" />}
          <span className="text-fg-faint hidden px-3 pt-2.5 pb-0.5 text-[11px] font-semibold tracking-wider uppercase xl:block">
            {group.title}
          </span>
          {group.items.map((entry) => (
            <NavLink key={entry.label} entry={entry} active={isActive(entry, pathname, tab)} />
          ))}
        </Fragment>
      ))}
    </>
  );
}

function NavLink({ entry, active }: { entry: NavItem; active: boolean }) {
  const { icon: Icon, href, label } = entry;
  const className = cn(
    "text-fg-muted hover:bg-surface-2 hover:text-fg flex h-9 w-full items-center justify-center gap-3 rounded-lg border-2 border-transparent text-sm font-medium transition-colors xl:justify-start xl:px-3",
    active &&
      "bg-primary text-primary-foreground border-fg hover:bg-primary hover:text-primary-foreground font-semibold shadow-[2px_3px_0_0_var(--color-fg)]",
  );
  const content = (
    <>
      <Icon className="size-[18px] shrink-0" />
      <span className="hidden xl:inline">{label}</span>
    </>
  );
  return entry.external ? (
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

/**
 * Two big buttons that open the other Bandcoin apps in a new tab: the AR map
 * and the artist portal ("Become an artist" until you are one). Below xl they
 * shrink to round icon buttons.
 */
function LaunchTiles() {
  const { status } = useSession();
  const me = api.account.me.useQuery(undefined, { enabled: status === "authenticated" });
  const artist = artistEntry(me.data?.artist ?? null);

  return (
    <>
      <LaunchTile
        href={AR_URL}
        title="Go to AR"
        hint="Collect drops"
        icon={ScanLine}
        className="bg-fg text-bg"
      />
      <LaunchTile
        href={ARTIST_URL}
        title={artist.title}
        hint={artist.hint}
        icon={Mic2}
        className="bg-primary text-primary-foreground border-fg"
      />
    </>
  );
}

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
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={title}
      className={cn(
        "group border-fg flex h-11 min-w-0 items-center justify-center gap-3 rounded-xl border-2 px-2 transition-transform duration-200 hover:-translate-y-0.5 hover:-rotate-1 xl:justify-start xl:px-3",
        className,
      )}
    >
      <span className="bg-bg/20 flex size-7 shrink-0 items-center justify-center rounded-full transition-transform duration-300 group-hover:rotate-12">
        <Icon className="size-4" strokeWidth={2.4} />
      </span>
      <span className="hidden min-w-0 flex-1 leading-tight xl:block">
        <span className="display block truncate text-sm">{title}</span>
        <span className="block truncate text-[11px] font-semibold opacity-70">{hint}</span>
      </span>
      <ArrowUpRight
        className="hidden size-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 xl:block"
        strokeWidth={2.8}
      />
      <span className="sr-only">{hint}, opens in a new tab</span>
    </a>
  );
}

/** Who you are and what you have, always in view. Signed out it's a sign-in prompt in the header instead. */
function AccountCard() {
  const { status } = useSession();
  const openSignIn = useConnectWalletDialogStore((state) => state.setIsOpen);
  const me = api.account.me.useQuery(undefined, { enabled: status === "authenticated" });

  if (status === "loading" || (status === "authenticated" && me.isPending))
    return <Skeleton className="h-14 w-full rounded-xl" />;
  if (!me.data)
    return (
      <Button
        className="w-full"
        title="Sign in"
        aria-label="Sign in"
        onClick={() => openSignIn(true)}
      >
        <LogIn />
        <span className="hidden xl:inline">Sign in</span>
      </Button>
    );
  const name =
    me.data.displayName ??
    me.data.username ??
    abbreviateAddress(me.data.walletAddress ?? undefined);

  return (
    <div className="border-fg bg-bg flex min-w-0 items-center justify-center gap-2 rounded-xl border-[3px] p-2 shadow-[3px_4px_0_0_var(--color-primary)] xl:justify-between">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Account menu"
            title={name}
            className="flex min-w-0 flex-1 items-center justify-center gap-2.5 rounded-lg text-left xl:justify-start"
          >
            <Avatar
              name={name}
              url={me.data.avatarUrl}
              className="bg-surface-3 grid size-9 shrink-0 place-items-center rounded-full object-cover text-xs font-bold"
            />
            <span className="hidden min-w-0 xl:grid">
              <b className="truncate text-sm leading-tight">{name}</b>
              <Money
                amount={me.data.balances.BANDCOIN}
                currency="BANDCOIN"
                short
                className="text-fg-muted text-xs"
              />
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" sideOffset={10} className="w-72">
          <AccountMenuItems me={me.data} name={name} />
        </DropdownMenuContent>
      </DropdownMenu>
      <Link
        href="/recharge"
        title="Recharge"
        aria-label="Recharge"
        className="bg-primary text-primary-foreground border-fg hidden size-8 shrink-0 items-center justify-center rounded-full border-2 xl:flex"
      >
        <Plus className="size-4" strokeWidth={3} />
      </Link>
    </div>
  );
}

/** The theme and Bandcoin's socials, then the info pages and the copyright on one small row; wide sidebar only. */
function SiteFooter() {
  return (
    <div className="border-fg/15 hidden gap-2 border-t pt-2 xl:grid">
      <div className="flex items-center justify-between gap-2">
        <SidebarTheme />
        <div className="flex gap-1.5">
          {SOCIALS.map((social) => (
            <a
              key={social.href}
              href={social.href}
              target="_blank"
              rel="noreferrer"
              aria-label={social.label}
              title={social.label}
              className="bg-surface-2 text-fg-muted hover:text-fg flex size-7 items-center justify-center rounded-full transition-colors"
            >
              <social.icon className="size-3.5" />
            </a>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 text-[10px] leading-none whitespace-nowrap">
        <div className="text-fg-muted flex gap-1.5 font-medium">
          {INFO_LINKS.map((info) => (
            <Link key={info.path} href={info.path} className="hover:text-fg hover:underline">
              {info.label}
            </Link>
          ))}
        </div>
        <span className="text-fg-faint">{copyrightLine()}</span>
      </div>
    </div>
  );
}
