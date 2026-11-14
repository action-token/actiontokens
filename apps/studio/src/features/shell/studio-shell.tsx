"use client";

import { Coins, Mic2, Plus, Store } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import type { ReactNode } from "react";

import { Button } from "@bandcoin/ui/components/button";
import { cn } from "@bandcoin/ui/lib/cn";
import { useSidebarCollapsed } from "@bandcoin/ui/lib/sidebar-collapsed";
import { BrandMark } from "@bandcoin/ui/patterns/boot-screen";
import { PhoneTabBar } from "@bandcoin/ui/patterns/phone-tab-bar";
import {
  SideBalance,
  SideFrame,
  sideIconButton,
  type SideAccount,
} from "@bandcoin/ui/patterns/side-frame";
import { SiteBackdrop } from "@bandcoin/ui/patterns/site-backdrop";
import { useConnectWalletDialogStore } from "@bandcoin/wallet";

import { api } from "~/trpc/react";

import { APP_URL, AR_URL, ARTIST_URL, isActive, NAV_GROUPS, PHONE_TABS, TOOL_PAGES } from "./nav";

/**
 * Studio's frame, the same as the marketplace's and the artist portal's: the
 * shared sidebar (Create and the tools, your work, your latest creations, the
 * other apps, your coins, your account), folding to a rail. Phones get a top
 * bar and tabs.
 */
export function StudioShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { collapsed, setCollapsed } = useSidebarCollapsed();
  const session = useSession();
  const signedIn = session.status === "authenticated";
  const openAccount = useConnectWalletDialogStore((state) => state.setIsOpen);
  const me = api.account.me.useQuery(undefined, { enabled: signedIn });
  const balance = api.coins.balance.useQuery(undefined, { enabled: signedIn, staleTime: 15_000 });

  const account: SideAccount =
    session.status === "loading"
      ? { state: "loading" }
      : !signedIn
        ? { state: "signedOut", onSignIn: () => openAccount(true) }
        : {
            state: "signedIn",
            name:
              me.data?.displayName ??
              me.data?.username ??
              session.data?.user?.name ??
              "Your account",
            address: me.data?.walletAddress,
            avatarUrl: me.data?.avatarUrl,
            onOpen: () => openAccount(true),
            onSignOut: () => void signOut({ redirect: false }),
            settingsHref: `${APP_URL}/settings`,
          };

  const coins = balance.data?.coins;
  const tabOf = (entry: (typeof PHONE_TABS.left)[number] & { external?: boolean }) => ({
    href: entry.href,
    label: entry.label,
    icon: entry.icon,
    active: !entry.external && isActive(entry, pathname),
    external: entry.external,
  });

  return (
    <div className="grid min-h-dvh grid-cols-1 sm:grid-cols-[auto_minmax(0,1fr)]">
      <SiteBackdrop />
      <SideFrame
        label="Studio"
        home={{ href: "/", label: "Studio home", tagline: "studio" }}
        tools={
          <Link href="/" aria-label="New creation" title="New creation" className={sideIconButton}>
            <Plus className="size-5" strokeWidth={2.6} />
          </Link>
        }
        groups={NAV_GROUPS.map((group) => ({
          title: group.title,
          items: group.items.map((entry) => ({ ...entry, active: isActive(entry, pathname) })),
        }))}
        extra={signedIn && <Recent />}
        tiles={[
          {
            href: APP_URL,
            title: "Marketplace",
            hint: "Your music and collection",
            icon: Store,
            tone: "ink",
          },
          {
            href: ARTIST_URL,
            title: "Artist portal",
            hint: "Your page and drops",
            icon: Mic2,
            tone: "mint",
          },
        ]}
        balance={
          signedIn && (
            <SideBalance
              href="/coins"
              icon={Coins}
              title="Studio coins"
              main={
                coins === undefined
                  ? null
                  : { amount: coins.toLocaleString("en-US"), code: "COINS" }
              }
              lines={
                coins === undefined
                  ? []
                  : [{ label: "Worth", value: `$${(coins / 100).toFixed(2)}` }]
              }
            />
          )
        }
        railBalance={signedIn && <SideBalance href="/coins" icon={Coins} main={null} rail />}
        account={account}
        infoBase={APP_URL}
        navSize="1.7rem"
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
      />

      <div className="flex min-w-0 flex-col">
        <header className="bg-bg/95 sticky top-0 z-30 flex h-14 items-center gap-3 border-b px-4 sm:hidden">
          <Link href="/" aria-label="Studio home" className="flex items-center gap-2">
            <BrandMark className="h-7" />
            <span className="marker text-primary-text text-sm">studio</span>
          </Link>
          <span className="ml-auto" />
          {signedIn ? (
            <Link
              href="/coins"
              className="bg-primary-soft text-primary-text flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-bold tabular-nums"
            >
              <Coins className="size-4" /> {coins?.toLocaleString("en-US") ?? "…"}
            </Link>
          ) : (
            <Button size="sm" onClick={() => openAccount(true)}>
              Sign in
            </Button>
          )}
        </header>
        <main className="relative isolate min-w-0 flex-1 pb-[var(--phone-bar-space)] sm:pb-0 sm:pl-(--side-w)">
          {/* soft colour glows behind every page, as on Gemini */}
          <div
            aria-hidden
            className="studio-glow pointer-events-none fixed inset-0 -z-10 overflow-hidden"
          >
            <span />
            <span />
            <span />
            <span />
          </div>
          {children}
        </main>
      </div>

      <PhoneTabBar
        left={PHONE_TABS.left.map(tabOf)}
        right={PHONE_TABS.right.map(tabOf)}
        arHref={AR_URL}
      />
    </div>
  );
}

/** Your last few creations under the links, each opening its tool at that result. */
function Recent() {
  const recent = api.generate.library.useQuery({}, { staleTime: 10_000 });
  const items = recent.data?.items.slice(0, 8) ?? [];
  if (items.length === 0) return null;
  return (
    <div>
      <p className="marker mb-1 -rotate-2 text-sm">*recent*</p>
      <ul className="grid gap-0.5">
        {items.map((item) => {
          const page = TOOL_PAGES[item.type];
          return (
            <li key={item.id}>
              <Link
                href={`${page.href}#run-${item.id}`}
                title={item.prompt}
                className={cn(
                  "hover:bg-side-ink/10 flex items-center gap-2 rounded-lg px-1.5 py-1 text-[13px] font-semibold transition-colors",
                  item.status === "FAILED" && "opacity-60",
                )}
              >
                <page.icon className="size-3.5 shrink-0 opacity-70" />
                <span className="truncate">{item.prompt}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
