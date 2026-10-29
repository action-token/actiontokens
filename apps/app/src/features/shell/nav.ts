import { Home, Layers, ListMusic, MapPin, Settings, Star, Store, Trophy, Wallet } from "lucide-react";

const AR_URL = process.env.NEXT_PUBLIC_AR_URL ?? "https://ar.bandcoin.io";

export type NavItem = {
  href: string;
  icon: typeof Home;
  label: string;
  external?: boolean;
  /** Paths that count as "on this page", besides `href` itself (detail pages) */
  also?: string[];
  /** The ?tab= value that selects this entry on its page, if it shares the page with another */
  tab?: string;
};

export const GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Browse",
    items: [
      { href: "/", icon: Home, label: "Home" },
      { href: "/marketplace", icon: Store, label: "Marketplace", also: ["/item", "/album"] },
      { href: "/bounties", icon: Trophy, label: "Bounties", also: ["/bounty"] },
      { href: AR_URL, icon: MapPin, label: "AR pins", external: true },
    ],
  },
  {
    title: "Library",
    items: [
      { href: "/collection", icon: Layers, label: "My collection" },
      { href: "/collection?tab=favorites", icon: Star, label: "Favourites", tab: "favorites" },
      { href: "/playlists", icon: ListMusic, label: "Playlists", also: ["/playlist"] },
    ],
  },
  {
    title: "Account",
    items: [
      { href: "/wallet", icon: Wallet, label: "Wallet", also: ["/recharge"] },
      { href: "/settings", icon: Settings, label: "Settings" },
    ],
  },
];

/** Bottom tabs on phones: the entries people use most. */
export const MOBILE_TABS = ["Home", "Marketplace", "Bounties", "My collection", "Playlists"]
  .map((label) => GROUPS.flatMap((group) => group.items).find((entry) => entry.label === label))
  .filter((entry): entry is NavItem => Boolean(entry));

/** Is this entry the page you're on? `tab` is the page's ?tab= value (My collection and Favourites share a page). */
export function isActive(entry: NavItem, pathname: string, tab: string | null) {
  if (entry.external) return false;
  const path = entry.href.split("?")[0]!;
  const on = path === "/" ? pathname === "/" : pathname === path || pathname.startsWith(`${path}/`) || (entry.also ?? []).some((extra) => pathname === extra || pathname.startsWith(`${extra}/`));
  if (!on) return false;
  if (entry.tab) return tab === entry.tab;
  // The plain entry on a shared page yields to the entry that owns the tab.
  const sibling = GROUPS.flatMap((group) => group.items).some((other) => other.tab && other.tab === tab && other.href.split("?")[0] === path);
  return !sibling;
}
