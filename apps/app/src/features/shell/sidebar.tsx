"use client";

import { Mic2, ScanLine, Wallet } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { Suspense } from "react";

import {
  SideBalance,
  SideFrame,
  type SideAccount,
  type SideGroup,
} from "@actiontokens/ui/patterns/side-frame";
import { abbreviateAddress } from "@actiontokens/utils/address";
import { useConnectWalletDialogStore } from "@actiontokens/wallet";

import { Money } from "~/components/money";
import { api } from "~/trpc/react";

import { AR_URL, ORG_URL, artistEntry, GROUPS, isActive } from "./nav";
import { HeaderTools } from "./sidebar-search";

/**
 * The desktop sidebar, the same frame as the artist portal's (Wadzzo's look):
 * Search and the bell beside the logo, the links in groups, tiles to AR and
 * the artist portal, your balances, then your account, the theme and the info
 * pages. The chevron on its edge folds it to a rail.
 */
export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    // useSearchParams needs a boundary; the sidebar renders right away, the highlight follows
    <Suspense fallback={<Frame tab={null} collapsed={collapsed} onToggle={onToggle} />}>
      <FrameWithTab collapsed={collapsed} onToggle={onToggle} />
    </Suspense>
  );
}

function FrameWithTab(props: { collapsed: boolean; onToggle: () => void }) {
  return <Frame tab={useSearchParams().get("tab")} {...props} />;
}

function Frame({
  tab,
  collapsed,
  onToggle,
}: {
  tab: string | null;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const pathname = usePathname();
  const { status } = useSession();
  const openWallet = useConnectWalletDialogStore((state) => state.setIsOpen);
  const me = api.account.me.useQuery(undefined, { enabled: status === "authenticated" });
  const artist = artistEntry(me.data?.organization ?? null);
  const signedIn = status === "authenticated";
  const balances = me.data?.balances;

  const groups: SideGroup[] = GROUPS.map((group) => ({
    title: group.title,
    items: group.items.map((entry) => ({
      href: entry.href,
      label: entry.label,
      icon: entry.icon,
      external: entry.external,
      active: isActive(entry, pathname, tab),
    })),
  }));

  const account: SideAccount =
    status === "loading" || (signedIn && me.isPending)
      ? { state: "loading" }
      : !signedIn || !me.data
        ? { state: "signedOut", onSignIn: () => openWallet(true) }
        : {
            state: "signedIn",
            name:
              me.data.displayName ??
              me.data.username ??
              abbreviateAddress(me.data.walletAddress ?? undefined),
            address: me.data.walletAddress,
            avatarUrl: me.data.avatarUrl,
            onOpen: () => openWallet(true),
            onSignOut: () => void signOut({ redirect: false }),
            settingsHref: "/settings",
          };

  return (
    <SideFrame
      label="Main"
      home={{ href: "/", label: "Action Tokens marketplace home", tagline: "marketplace" }}
      tools={<HeaderTools />}
      groups={groups}
      tiles={[
        { href: AR_URL, title: "Go to AR", hint: "Collect drops", icon: ScanLine, tone: "ink" },
        { href: ORG_URL, title: artist.title, hint: artist.hint, icon: Mic2, tone: "mint" },
      ]}
      balance={
        signedIn && (
          <SideBalance
            href="/wallet"
            icon={Wallet}
            main={
              balances
                ? {
                    amount: (
                      <Money amount={balances.ACTION} currency="ACTION" short className="display" />
                    ),
                    code: "ACTION",
                  }
                : null
            }
            lines={(["XLM", "USDC"] as const).map((currency) => ({
              label: currency,
              value: balances && <Money amount={balances[currency]} currency={currency} short />,
            }))}
          />
        )
      }
      railBalance={signedIn && <SideBalance href="/wallet" icon={Wallet} main={null} rail />}
      account={account}
      navSize="2.15rem"
      collapsed={collapsed}
      onToggle={onToggle}
    />
  );
}
