import { Home, Layers, ListMusic, Newspaper, Star, Store, Trophy } from "lucide-react";

export const AR_URL = process.env.NEXT_PUBLIC_AR_URL ?? "https://ar.bandcoin.io";
export const ARTIST_URL = process.env.NEXT_PUBLIC_ARTIST_URL ?? "https://artist.bandcoin.io";

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
      { href: "/collection?tab=favorites", icon: Star, label: "Favourites", tab: "favorites" },
      { href: "/playlists", icon: ListMusic, label: "Playlists", also: ["/playlist"] },
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
  artist: { name: string; status: "PENDING" | "APPROVED" | "BANNED" | "REJECTED" } | null,
) {
  if (!artist) return { title: "Become an artist", hint: "Open your page" };
  if (artist.status === "APPROVED") return { title: "Artist portal", hint: artist.name };
  if (artist.status === "PENDING") return { title: "Artist portal", hint: "In review" };
  if (artist.status === "REJECTED") return { title: "Artist portal", hint: "Not approved" };
  return { title: "Artist portal", hint: "Account status" };
}
