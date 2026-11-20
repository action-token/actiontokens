import { Home, Layers, ListMusic, Newspaper, Star, Store, Tag, Trophy } from "lucide-react";

export const AR_URL = process.env.NEXT_PUBLIC_AR_URL ?? "https://ar.action-tokens.com";
export const ORG_URL = process.env.NEXT_PUBLIC_ORG_URL ?? "https://org.action-tokens.com";

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
      { href: "/feed", icon: Newspaper, label: "Feed" },
      { href: "/marketplace", icon: Store, label: "Marketplace", also: ["/item", "/album"] },
      { href: "/bounties", icon: Trophy, label: "Bounties", also: ["/bounty"] },
    ],
  },
  {
    title: "Library",
    items: [
      { href: "/collection", icon: Layers, label: "My collection" },
      { href: "/selling", icon: Tag, label: "MY LISTING" },
      { href: "/collection?tab=favorites", icon: Star, label: "Favourites", tab: "favorites" },
      { href: "/playlists", icon: ListMusic, label: "Playlists", also: ["/playlist"] },
    ],
  },
];

const entryNamed = (label: string) =>
  GROUPS.flatMap((group) => group.items).find((entry) => entry.label === label);

/** Bottom tabs on phones, either side of the raised AR key: Home, Collection | AR | Marketplace, Playlists. */
export const MOBILE_TABS = {
  left: ["Home", "My collection"].map(entryNamed).filter((entry): entry is NavItem => !!entry),
  right: ["Marketplace", "Playlists"].map(entryNamed).filter((entry): entry is NavItem => !!entry),
};

/** The phone bar's short labels. */
export const TAB_LABEL: Record<string, string> = { "My collection": "Collection" };

/** Is this entry the page you're on? `tab` is the page's ?tab= value (My collection and Favourites share a page). */
export function isActive(entry: NavItem, pathname: string, tab: string | null) {
  if (entry.external) return false;
  const path = entry.href.split("?")[0]!;
  const on =
    path === "/"
      ? pathname === "/"
      : pathname === path ||
        pathname.startsWith(`${path}/`) ||
        (entry.also ?? []).some((extra) => pathname === extra || pathname.startsWith(`${extra}/`));
  if (!on) return false;
  if (entry.tab) return tab === entry.tab;
  // The plain entry on a shared page yields to the entry that owns the tab.
  const sibling = GROUPS.flatMap((group) => group.items).some(
    (other) => other.tab && other.tab === tab && other.href.split("?")[0] === path,
  );
  return !sibling;
}

/** The artist-portal tile: an invitation for fans, the way in for artists, and the right words in between. Short, so it fits the sidebar. */
export function artistEntry(
  organization: { name: string; status: "PENDING" | "APPROVED" | "BANNED" | "REJECTED" } | null,
) {
  if (!organization) return { title: "Become an artist", hint: "Open your page" };
  if (organization.status === "APPROVED") return { title: "Artist portal", hint: organization.name };
  if (organization.status === "PENDING") return { title: "Artist portal", hint: "In review" };
  if (organization.status === "REJECTED") return { title: "Artist portal", hint: "Not approved" };
  return { title: "Artist portal", hint: "Account status" };
}
