"use client";

import { ScanLine, Store } from "lucide-react";
import { signOut, useSession } from "next-auth/react";

import { SideFrame, type SideAccount } from "@bandcoin/ui/patterns/side-frame";
import { useConnectWalletDialogStore } from "@bandcoin/wallet";

import { api } from "~/trpc/react";

import { NotificationBell } from "../notifications/notification-bell";
import { WalletSidebarCard } from "../wallet/wallet-view";
import { AR_URL, FAN_APP_URL } from "./links";
import { isActive, type NavGroup } from "./nav";

/**
 * The portal sidebar, the same frame as the marketplace's (Wadzzo's look): the
 * bell beside the logo, the sections as big words, tiles to AR and the
 * marketplace, the wallet card, then who is signed in, the theme and the info
 * pages. The chevron on its edge folds it to a rail.
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
  /** The handwritten line under the name: "artist portal", "admin portal" */
  portalName: string;
  /** A name to show before the account loads (the artist's, from the server) */
  fallbackName?: string;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const session = useSession();
  const openAccount = useConnectWalletDialogStore((state) => state.setIsOpen);
  const me = api.account.me.useQuery(undefined, {
    enabled: session.status === "authenticated",
  });
  const signedIn = session.status === "authenticated";

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
              fallbackName ??
              session.data?.user?.name ??
              "Your account",
            address: me.data?.walletAddress,
            avatarUrl: me.data?.avatarUrl,
            onOpen: () => openAccount(true),
            onSignOut: () => void signOut({ redirect: false }),
            settingsHref: "/settings",
          };

  return (
    <SideFrame
      label="Main"
      home={{ href: "/", label: "Portal home", tagline: portalName }}
      tools={signedIn && <NotificationBell side="right" align="start" />}
      groups={groups.map((group) => ({
        title: group.title,
        items: group.items.map((entry) => ({
          href: entry.href,
          label: entry.label,
          icon: entry.icon,
          active: isActive(entry, pathname),
        })),
      }))}
      tiles={[
        {
          href: AR_URL,
          title: "Go to AR",
          hint: "Your drops on the map",
          icon: ScanLine,
          tone: "ink",
        },
        {
          href: FAN_APP_URL,
          title: "Marketplace",
          hint: "See it as fans do",
          icon: Store,
          tone: "mint",
        },
      ]}
      balance={<WalletSidebarCard />}
      railBalance={<WalletSidebarCard rail />}
      account={account}
      infoBase={FAN_APP_URL}
      navSize="1.7rem"
      collapsed={collapsed}
      onToggle={onToggle}
    />
  );
}
