"use client";

import { ScanLine, Store } from "lucide-react";
import { signOut, useSession } from "next-auth/react";

import { ControlDeck } from "@actiontokens/ui/patterns/control-deck";
import type { SideAccount } from "@actiontokens/ui/patterns/side-frame";
import { useConnectWalletDialogStore } from "@actiontokens/wallet";

import { api } from "~/trpc/react";

import { NotificationBell } from "../notifications/notification-bell";
import { WalletSummary } from "../wallet/wallet-view";
import { AR_URL, FAN_APP_URL } from "./links";
import { isActive, type NavGroup } from "./nav";

/**
 * The portal sidebar: the shared control deck (`@actiontokens/ui/patterns/control-deck`) with the
 * portal's sections, the bell, launch cards to the AR app and the marketplace, and the balance.
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

  const account: SideAccount = signedIn
    ? {
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
      }
    : session.status === "loading"
      ? { state: "loading" }
      : { state: "signedOut", onSignIn: () => openAccount(true) };

  const bell = signedIn ? <NotificationBell side="right" align="start" /> : null;

  return (
    <ControlDeck
      home={{ href: "/", label: "Portal home" }}
      tagline={portalName}
      tools={bell}
      railTools={bell}
      groups={groups.map((group) => ({
        title: group.title,
        items: group.items.map((entry) => ({
          href: entry.href,
          label: entry.label,
          icon: entry.icon,
          active: isActive(entry, pathname),
        })),
      }))}
      launch={[
        { href: AR_URL, label: "Go to AR", hint: "Drops on map", icon: ScanLine },
        { href: FAN_APP_URL, label: "Market", hint: "See as fans", icon: Store, acid: true },
      ]}
      balance={<WalletSummary />}
      account={account}
      collapsed={collapsed}
      onToggle={onToggle}
    />
  );
}
