"use client";

import { Building2, ScanLine } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { Suspense } from "react";

import { ControlDeck, DeckVault } from "@actiontokens/ui/patterns/control-deck";
import type { SideAccount, SideGroup } from "@actiontokens/ui/patterns/side-frame";
import { abbreviateAddress } from "@actiontokens/utils/address";
import { useConnectWalletDialogStore } from "@actiontokens/wallet";

import { Money } from "~/components/money";
import { api } from "~/trpc/react";

import { AR_URL, ORG_URL, artistEntry, GROUPS, isActive } from "./nav";

/**
 * The desktop sidebar: the shared Action-Tokens control deck (the same as the org portal's),
 * without its header (the notch above every page has the logo, search and bell): the links in groups, launch cards to AR and the
 * organization portal, the vault, then your account and the theme. The chevron folds it.
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
  const org = artistEntry(me.data?.organization ?? null);
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
    <ControlDeck
      home={{ href: "/", label: "Action-Tokens marketplace home" }}
      tagline="Marketplace"
      header={false}
      groups={groups}
      launch={[
        { href: AR_URL, label: "Go to AR", hint: "Collect drops", icon: ScanLine },
        { href: ORG_URL, label: org.title, hint: org.hint, icon: Building2, acid: true },
      ]}
      balance={
        signedIn && (
          <DeckVault
            href="/wallet"
            code="ACTION"
            amount={balances ? <Money amount={balances.ACTION} currency="ACTION" short /> : null}
            lines={(["XLM", "USDC"] as const).map((currency) => ({
              label: currency,
              value: balances ? (
                <Money amount={balances[currency]} currency={currency} short />
              ) : null,
            }))}
          />
        )
      }
      account={account}
      collapsed={collapsed}
      onToggle={onToggle}
    />
  );
}
