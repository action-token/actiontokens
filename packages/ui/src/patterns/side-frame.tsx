"use client";

import {
  ArrowRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  LogIn,
  LogOut,
  Monitor,
  Moon,
  Settings,
  Sun,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { type CSSProperties, Fragment, type ReactNode, useSyncExternalStore } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "../components/avatar";
import { Skeleton } from "../components/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../components/tooltip";
import { cn } from "../lib/cn";
import { BrandMark } from "./boot-screen";
import { TallText as Tall } from "./tall-text";
import { copyrightLine, INFO_LINKS, SOCIALS } from "./site-links";

export type SideLink = {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  /** Another app: opens as a plain link */
  external?: boolean;
};
export type SideGroup = { title: string; items: SideLink[] };
export type SideTile = {
  href: string;
  title: string;
  hint: string;
  icon: LucideIcon;
  tone: "ink" | "mint";
};
export type SideAccount =
  | { state: "loading" }
  | { state: "signedOut"; onSignIn: () => void }
  | {
      state: "signedIn";
      name: string;
      address?: string | null;
      avatarUrl?: string | null;
      onOpen: () => void;
      onSignOut: () => void;
      settingsHref: string;
    };

/** A round button in the sidebar header (Search, the bell): an ink circle on the block. */
export const sideIconButton =
  "bg-side-ink text-side relative flex size-10 shrink-0 items-center justify-center rounded-full transition-transform duration-200 hover:scale-110";

const short = (address: string) => `${address.slice(0, 5)}…${address.slice(-5)}`;

/**
 * The desktop sidebar of the marketplace and the artist portal, as in Wadzzo:
 * a coloured block (chartreuse in dark mode, ink in light) with the logo and
 * round buttons on top, a scrolling body between dashed rules (big-word links,
 * tiles to the other apps, the balance card) and a fixed footer (profile,
 * theme, socials, info pages). Folded, or below xl, it is a rail of ink
 * circles; the chevron on its edge folds it.
 */
export function SideFrame({
  label,
  home,
  tools,
  groups,
  tiles,
  balance,
  railBalance,
  extra,
  account,
  infoBase,
  navSize,
  collapsed,
  onToggle,
}: {
  label: string;
  home: { href: string; label: string; tagline: string };
  /** The header's round buttons; shown in a row open, stacked on the rail */
  tools?: ReactNode;
  groups: SideGroup[];
  tiles: SideTile[];
  balance?: ReactNode;
  railBalance?: ReactNode;
  /** Shown under the links when the sidebar is open (Studio's recent creations) */
  extra?: ReactNode;
  account: SideAccount;
  /** Where the info pages live, when they are in another app */
  infoBase?: string;
  /** The link words' size: smaller when there are many */
  navSize: string;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <TooltipProvider delayDuration={200}>
      <aside
        aria-label={label}
        style={{ "--side-nav-size": navSize } as CSSProperties}
        className={cn(
          "side-scope bg-side text-side-ink sticky top-0 z-40 hidden h-dvh shrink-0 sm:block",
          collapsed ? "w-[5.25rem]" : "w-[5.25rem] xl:w-[19.5rem]",
        )}
      >
        <div className={cn("h-full flex-col", collapsed ? "hidden" : "hidden xl:flex")}>
          <div className="flex shrink-0 items-center justify-between gap-2 px-5 pt-6 pb-4">
            <SideMark {...home} />
            {tools && <div className="flex shrink-0 items-center gap-2">{tools}</div>}
          </div>

          {/* `relative` keeps sr-only children inside the scroll area */}
          <div className="border-side-ink/25 relative min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain border-y-2 border-dashed px-5 py-5 [scrollbar-width:none]">
            <nav className="space-y-4" aria-label="Sections">
              {groups.map((group) => (
                <div key={group.title}>
                  <p className="marker mb-1 -rotate-2 text-sm">*{group.title.toLowerCase()}*</p>
                  <ul>
                    {group.items.map((item, index) => (
                      <li key={item.href}>
                        {index > 0 && <div className="dash-rule my-1" role="separator" />}
                        <BigNavLink item={item} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
            {extra}
            {tiles.length > 0 && (
              <div className="space-y-2.5">
                {tiles.map((tile) => (
                  <LaunchTile key={tile.href} tile={tile} />
                ))}
              </div>
            )}
            {balance}
          </div>

          <div className="shrink-0 space-y-2 px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <ProfileRow account={account} />
            <div className="flex items-center justify-between gap-2">
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
                    className="bg-side-ink text-side flex size-6 items-center justify-center rounded-full transition-transform hover:scale-110"
                  >
                    <social.icon className="size-3" />
                  </a>
                ))}
              </div>
            </div>
            {/* info pages and the copyright share the last row */}
            <div className="border-side-ink/25 flex items-center justify-between gap-2 border-t-2 border-dashed pt-2 text-[10px] leading-none whitespace-nowrap">
              <div className="text-side-ink/75 flex gap-1.5 font-medium">
                {INFO_LINKS.map((info) =>
                  infoBase ? (
                    <a
                      key={info.path}
                      href={`${infoBase}${info.path}`}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:text-side-ink hover:underline"
                    >
                      {info.label}
                    </a>
                  ) : (
                    <Link
                      key={info.path}
                      href={info.path}
                      className="hover:text-side-ink hover:underline"
                    >
                      {info.label}
                    </Link>
                  ),
                )}
              </div>
              <span className="text-side-ink/60 font-medium">{copyrightLine()}</span>
            </div>
          </div>
        </div>

        <div className={cn("h-full flex-col", collapsed ? "flex" : "flex xl:hidden")}>
          <div className="flex shrink-0 flex-col items-center gap-3 px-2 pt-5 pb-3">
            <SideMark {...home} compact />
            {tools && <div className="flex flex-col items-center gap-2">{tools}</div>}
          </div>
          <div className="border-side-ink/25 relative flex min-h-0 flex-1 flex-col items-center gap-3 overflow-y-auto overscroll-contain border-y-2 border-dashed px-2 py-3 [scrollbar-width:none] [&>*]:shrink-0">
            <nav className="flex flex-col items-center gap-3" aria-label="Sections">
              {groups.map((group, index) => (
                <Fragment key={group.title}>
                  {index > 0 && <div className="dash-rule w-8" aria-hidden />}
                  {group.items.map((item) => (
                    <RailLink key={item.href} item={item} />
                  ))}
                </Fragment>
              ))}
            </nav>
            {tiles.length > 0 && <div className="dash-rule w-8" aria-hidden />}
            {tiles.map((tile) => (
              <RailTile key={tile.href} tile={tile} />
            ))}
            {railBalance}
          </div>
          <div className="flex shrink-0 justify-center px-2 pt-3 pb-4">
            <RailProfile account={account} />
          </div>
        </div>

        {/* the chevron on the middle of the edge folds and unfolds it (wide screens only) */}
        <button
          type="button"
          onClick={onToggle}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          className="border-side bg-side-ink text-side absolute top-1/2 -right-3.5 z-50 hidden size-7 -translate-y-1/2 items-center justify-center rounded-full border-2 transition-transform hover:scale-110 xl:flex"
        >
          {collapsed ? (
            <ChevronRight className="size-4" strokeWidth={2.6} />
          ) : (
            <ChevronLeft className="size-4" strokeWidth={2.6} />
          )}
        </button>
      </aside>
    </TooltipProvider>
  );
}

/** The logo on an ink blob, "Bandcoin" and the handwritten app name; the blob alone on the rail. */
function SideMark({
  href,
  label,
  tagline,
  compact = false,
}: {
  href: string;
  label: string;
  tagline: string;
  compact?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={compact ? label : undefined}
      className="group flex min-w-0 items-center gap-2.5"
    >
      <span className="blob bg-side-badge flex size-10 shrink-0 items-center justify-center transition-transform duration-200 group-hover:-rotate-6">
        <BrandMark className="h-6" />
      </span>
      {!compact && (
        <span className="min-w-0 leading-none">
          <Tall className="pb-[0.12em] text-[1.9rem]">Bandcoin</Tall>
          <span className="marker text-side-ink/75 -mt-0.5 block -rotate-2 text-[12px] whitespace-nowrap">
            {tagline}
          </span>
        </span>
      )}
    </Link>
  );
}

/** A big word and an arrow in an ink circle; the current page gets a scribbled underline and a pale circle. */
function BigNavLink({ item }: { item: SideLink }) {
  const content = (
    <>
      <span className="min-w-0 flex-1 transition-transform duration-200 group-hover:translate-x-1">
        <Tall underline={item.active} className="text-[length:var(--side-nav-size)]">
          {item.label}
        </Tall>
      </span>
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full transition-transform duration-200 group-hover:-rotate-45",
          item.active ? "bg-side-mint text-primary-foreground" : "bg-side-ink text-side",
        )}
      >
        <ArrowRight className="size-[18px]" strokeWidth={2.6} />
      </span>
    </>
  );
  const className = "group flex items-center justify-between gap-3 py-0.5";
  return item.external ? (
    <a href={item.href} className={className}>
      {content}
    </a>
  ) : (
    <Link href={item.href} aria-current={item.active ? "page" : undefined} className={className}>
      {content}
    </Link>
  );
}

/** The rail's link: an ink circle (pale when current), named in a tooltip. */
function RailLink({ item }: { item: SideLink }) {
  const Icon = item.icon;
  const className = cn(
    "relative flex size-11 items-center justify-center rounded-full transition-transform duration-200 hover:scale-110",
    item.active ? "bg-side-mint text-primary-foreground" : "bg-side-ink text-side",
  );
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {item.external ? (
          <a href={item.href} aria-label={item.label} className={className}>
            <Icon className="size-5" strokeWidth={2.4} />
          </a>
        ) : (
          <Link
            href={item.href}
            aria-label={item.label}
            aria-current={item.active ? "page" : undefined}
            className={className}
          >
            <Icon className="size-5" strokeWidth={2.4} />
          </Link>
        )}
      </TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}

const tileTone = {
  ink: { tile: "bg-side-ink text-side", dot: "bg-side text-side-ink" },
  mint: {
    tile: "bg-side-mint text-primary-foreground",
    dot: "bg-primary-foreground text-side-mint",
  },
};

/** A tall tile that opens another Bandcoin app in a new tab. */
function LaunchTile({ tile }: { tile: SideTile }) {
  const Icon = tile.icon;
  const tone = tileTone[tile.tone];
  return (
    <a
      href={tile.href}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "group blob flex h-14 w-full origin-left items-center gap-3 px-3 transition-transform duration-200 hover:-translate-y-0.5 hover:-rotate-1",
        tone.tile,
      )}
    >
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-full transition-transform duration-300 group-hover:rotate-12",
          tone.dot,
        )}
      >
        <Icon className="size-[18px]" strokeWidth={2.5} />
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        {/* long titles step down so more of them fits, as in Wadzzo */}
        <Tall
          className={cn(
            "pb-[0.12em]",
            tile.title.length <= 11 ? "text-2xl" : tile.title.length <= 15 ? "text-xl" : "text-lg",
          )}
        >
          {tile.title}
        </Tall>
        <span className="block truncate text-[11px] font-semibold opacity-70">{tile.hint}</span>
      </span>
      <ArrowUpRight
        className="size-5 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
        strokeWidth={2.8}
      />
      <span className="sr-only">, opens in a new tab</span>
    </a>
  );
}

function RailTile({ tile }: { tile: SideTile }) {
  const Icon = tile.icon;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <a
          href={tile.href}
          target="_blank"
          rel="noreferrer"
          aria-label={`${tile.title}, opens in a new tab`}
          className={cn(
            "blob flex size-11 items-center justify-center transition-transform duration-200 hover:-translate-y-0.5",
            tileTone[tile.tone].tile,
          )}
        >
          <Icon className="size-5" strokeWidth={2.4} />
        </a>
      </TooltipTrigger>
      <TooltipContent side="right">{tile.title}</TooltipContent>
    </Tooltip>
  );
}

function AccountAvatar({ name, url }: { name: string; url?: string | null }) {
  return (
    <Avatar className="border-side size-8 border-2">
      {url && <AvatarImage src={url} alt="" />}
      <AvatarFallback className="bg-side text-side-ink text-xs font-bold">
        {name.slice(0, 2).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}

/** Who is signed in (opens the account and wallet dialog), then Settings and sign out. */
function ProfileRow({ account }: { account: SideAccount }) {
  if (account.state === "loading")
    return (
      <Skeleton className="bg-side-ink/15 h-11 rounded-xl" aria-label="Loading your account" />
    );
  if (account.state === "signedOut")
    return (
      <button
        type="button"
        onClick={account.onSignIn}
        className="bg-side-ink text-side display flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm"
      >
        <LogIn className="size-4" /> Sign in
      </button>
    );
  return (
    <div className="bg-side-ink text-side-chip flex items-center gap-1.5 rounded-xl p-1.5">
      <button
        type="button"
        onClick={account.onOpen}
        title="Account & wallets"
        className="group hover:bg-side-chip/10 -m-0.5 flex min-w-0 flex-1 items-center gap-2 rounded-lg p-0.5 text-left transition-colors"
      >
        <AccountAvatar name={account.name} url={account.avatarUrl} />
        <span className="min-w-0 flex-1 leading-tight">
          <span className="display text-side block truncate text-[13px] group-hover:underline">
            {account.name}
          </span>
          {account.address && (
            <span className="text-side-chip/60 block truncate font-mono text-[10px]">
              {short(account.address)}
            </span>
          )}
        </span>
      </button>
      <Link
        href={account.settingsHref}
        aria-label="Settings"
        title="Settings"
        className="text-side-chip/80 hover:bg-side-chip/10 hover:text-side flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors"
      >
        <Settings className="size-3.5" strokeWidth={2.6} />
      </Link>
      <button
        type="button"
        onClick={account.onSignOut}
        aria-label="Sign out"
        title="Sign out"
        className="bg-side text-side-ink flex size-7 shrink-0 items-center justify-center rounded-lg transition-transform duration-200 hover:scale-105"
      >
        <LogOut className="size-3.5" strokeWidth={2.6} />
      </button>
    </div>
  );
}

/** The rail's footer: Settings and sign out as small circles over the avatar, or a sign-in circle. */
function RailProfile({ account }: { account: SideAccount }) {
  const circle =
    "bg-side-ink text-side flex size-9 items-center justify-center rounded-full transition-transform hover:scale-110";
  if (account.state === "loading")
    return <Skeleton className="bg-side-ink/15 size-11 rounded-full" />;
  if (account.state === "signedOut")
    return (
      <button
        type="button"
        onClick={account.onSignIn}
        aria-label="Sign in"
        title="Sign in"
        className={circle}
      >
        <LogIn className="size-4" strokeWidth={2.6} />
      </button>
    );
  return (
    <div className="flex flex-col items-center gap-2">
      <Link href={account.settingsHref} aria-label="Settings" title="Settings" className={circle}>
        <Settings className="size-4" strokeWidth={2.6} />
      </Link>
      <button
        type="button"
        onClick={account.onSignOut}
        aria-label="Sign out"
        title="Sign out"
        className={circle}
      >
        <LogOut className="size-4" strokeWidth={2.6} />
      </button>
      <button
        type="button"
        onClick={account.onOpen}
        aria-label={`${account.name}: account & wallets`}
        title="Account & wallets"
        className="bg-side-ink rounded-full p-1 transition-transform hover:scale-110"
      >
        <AccountAvatar name={account.name} url={account.avatarUrl} />
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

function ThemeSwitch() {
  const { theme: stored, setTheme } = useTheme();
  // next-themes knows the theme only on the client; nothing is selected until then.
  const theme = useMounted() ? stored : undefined;
  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="bg-side-ink/10 flex gap-0.5 rounded-full p-0.5"
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
            theme === option.id ? "bg-side-ink text-side" : "text-side-ink/60 hover:text-side-ink",
          )}
        >
          <option.icon className="size-3" strokeWidth={2.4} />
        </button>
      ))}
    </div>
  );
}

/**
 * The balance card on the block: a "Balance · Wallet →" row, the main
 * balance big, and smaller lines under it. `rail` is just a wallet blob.
 */
export function SideBalance({
  href,
  title = "Balance",
  main,
  lines,
  extra,
  rail = false,
  icon: Icon,
}: {
  href: string;
  title?: string;
  /** The big number (and its code, when the amount doesn't show it); null while loading */
  main: { amount: ReactNode; code?: string } | null;
  lines?: { label: string; value: ReactNode }[];
  extra?: ReactNode;
  rail?: boolean;
  icon: LucideIcon;
}) {
  if (rail)
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href={href}
            aria-label="Open your wallet"
            className="blob bg-side-ink text-side flex size-11 items-center justify-center transition-transform duration-200 hover:-translate-y-0.5"
          >
            <Icon className="size-5" strokeWidth={2.4} />
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right">Wallet</TooltipContent>
      </Tooltip>
    );
  return (
    <Link
      href={href}
      aria-label={`${title}: open your wallet`}
      className="group blob bg-side-ink text-side-chip block p-3 transition-transform duration-200 hover:-translate-y-0.5"
    >
      <span className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <span className="bg-side text-side-ink flex size-7 items-center justify-center rounded-full">
            <Icon className="size-3.5" strokeWidth={2.6} />
          </span>
          <span className="text-side-chip/70 text-[10px] font-bold tracking-[0.08em] uppercase">
            {title}
          </span>
        </span>
        <span className="text-side flex items-center gap-1 text-[11px] font-bold">
          Wallet
          <ArrowRight
            className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
            strokeWidth={2.8}
          />
        </span>
      </span>
      {main === null ? (
        <Skeleton className="bg-side-chip/15 mt-2.5 h-14 w-full" />
      ) : (
        <>
          {/* laid out like the lines under it: the code first, then the icon and the amount */}
          <span className="mt-2.5 flex items-center justify-between gap-2">
            {main.code && (
              <span className="text-side-chip/80 shrink-0 text-[11px] font-bold">{main.code}</span>
            )}
            <span className="display text-side min-w-0 truncate text-2xl leading-none tabular-nums">
              {main.amount}
            </span>
          </span>
          {lines && lines.length > 0 && (
            <span className="mt-2 grid gap-0.5">
              {lines.map((line) => (
                <span
                  key={line.label}
                  className="text-side-chip/70 flex items-center justify-between gap-2 text-[11px] font-semibold"
                >
                  <span className="min-w-0 truncate">{line.label}</span>
                  <span className="num min-w-0 truncate">{line.value}</span>
                </span>
              ))}
            </span>
          )}
          {extra}
        </>
      )}
    </Link>
  );
}
