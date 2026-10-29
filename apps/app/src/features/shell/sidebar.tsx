"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Fragment, Suspense } from "react";

import { cn } from "@bandcoin/ui/lib/cn";
import { BrandMark } from "@bandcoin/ui/patterns/boot-screen";
import { abbreviateAddress } from "@bandcoin/utils/address";

import { Money } from "~/components/money";
import { api } from "~/trpc/react";

import { Avatar } from "./context-panel";
import { GROUPS, isActive, type NavItem } from "./nav";

/**
 * The desktop sidebar: links in groups (the page you're on is filled in the
 * brand yellow), and your account at the bottom with your balance and a
 * Recharge button. Below the xl breakpoint it is an icon rail.
 */
export function Sidebar() {
  return (
    <nav
      aria-label="Main"
      className="bg-surface sticky top-0 hidden h-dvh grid-rows-[auto_minmax(0,1fr)_auto] gap-2 border-r px-3 py-4 sm:grid"
    >
      <Link href="/" className="flex items-center justify-center gap-2 pb-3 xl:justify-start xl:px-2">
        <BrandMark className="size-[28px]" />
        <span className="font-display hidden text-[15px] font-extrabold tracking-tight xl:inline">Bandcoin</span>
      </Link>

      <div className="grid content-start gap-1 overflow-y-auto">
        {/* useSearchParams needs a boundary; links render right away, the highlight follows */}
        <Suspense fallback={<Links tab={null} />}>
          <LinksWithTab />
        </Suspense>
      </div>

      <AccountCard />
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
          <span className="text-fg-faint hidden px-3 pt-3 pb-1 text-[11px] font-semibold tracking-wider uppercase xl:block">{group.title}</span>
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
    "text-fg-muted hover:bg-surface-2 hover:text-fg flex h-10 w-full items-center justify-center gap-3 rounded-lg border-2 border-transparent text-sm font-medium transition-colors xl:justify-start xl:px-3",
    active && "bg-primary text-primary-foreground border-fg hover:bg-primary hover:text-primary-foreground font-semibold shadow-[2px_3px_0_0_var(--color-fg)]",
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
    <Link href={href} aria-current={active ? "page" : undefined} className={className} title={label}>
      {content}
    </Link>
  );
}

/** Who you are and what you have, always in view. Signed out it's a sign-in prompt in the header instead. */
function AccountCard() {
  const { status } = useSession();
  const me = api.account.me.useQuery(undefined, { enabled: status === "authenticated" });
  if (!me.data) return null;
  const name = me.data.displayName ?? me.data.username ?? abbreviateAddress(me.data.walletAddress ?? undefined);

  return (
    <div className="border-fg bg-bg grid gap-2 rounded-xl border-[3px] p-2 shadow-[3px_4px_0_0_var(--color-primary)] xl:p-3">
      <Link href="/settings" className="flex items-center justify-center gap-2.5 xl:justify-start" title={name}>
        <Avatar name={name} url={me.data.avatarUrl} className="bg-surface-3 grid size-9 shrink-0 place-items-center rounded-full object-cover text-xs font-bold" />
        <span className="hidden min-w-0 xl:grid">
          <b className="truncate text-sm leading-tight">{name}</b>
          <Money amount={me.data.balances.BANDCOIN} currency="BANDCOIN" short className="text-fg-muted text-xs" />
        </span>
      </Link>
      <Link
        href="/recharge"
        title="Recharge"
        className="bg-primary text-primary-foreground border-fg flex h-8 items-center justify-center gap-1.5 rounded-full border-2 text-xs font-bold"
      >
        <Plus className="size-3.5" />
        <span className="hidden xl:inline">Recharge</span>
      </Link>
    </div>
  );
}
