import { BadgeCheck, BarChart3, CalendarDays, Code2, Crown, Frame, ListChecks, Map, MapPin, Megaphone, Music2, Package, Rocket, Trophy, Users, type LucideIcon } from "lucide-react";

import type { OnboardingStep } from "@bandcoin/api";

export type NavItem = {
  href: string;
  icon: LucideIcon;
  label: string;
  /** What the phone tab bar says when the label is too long for it. */
  shortLabel?: string;
  exact?: boolean;
  /** Sub-paths that belong to another item (e.g. /pins/manage under the map). */
  exclude?: string[];
  /** One of the four tabs on a phone's bottom bar. */
  tab?: boolean;
};
export type NavGroup = { title: string; items: NavItem[] };

export type PortalNavInput = {
  signedIn: boolean;
  /** null when the person has not applied yet. */
  step: OnboardingStep | null;
  isAdmin: boolean;
};

const ADMIN: NavGroup = {
  title: "Admin",
  items: [
    { href: "/admin/artists", icon: Users, label: "Artists" },
    { href: "/admin/murals", icon: Frame, label: "Mural review" },
    { href: "/admin/activity", icon: ListChecks, label: "Activity" },
  ],
};

/** An approved artist's tools, drops first (as in Wadzzo's brand portal), then content, then what they sell. */
const READY_TOOLS: NavGroup[] = [
  {
    title: "Drops",
    items: [
      { href: "/pins", icon: Map, label: "Map", exclude: ["/pins/manage"], tab: true },
      { href: "/pins/manage", icon: MapPin, label: "Pin management", shortLabel: "Pins", tab: true },
      { href: "/events", icon: CalendarDays, label: "Events", tab: true },
      { href: "/embeds", icon: Code2, label: "Website map" },
    ],
  },
  {
    title: "Content",
    items: [
      { href: "/announcements", icon: Megaphone, label: "Announcements" },
      { href: "/bounties", icon: Trophy, label: "Bounties", tab: true },
    ],
  },
  {
    title: "Sell",
    items: [
      { href: "/music", icon: Music2, label: "Music" },
      { href: "/items", icon: Package, label: "Items" },
      { href: "/memberships", icon: Crown, label: "Memberships" },
    ],
  },
  {
    title: "Insights",
    items: [{ href: "/reports", icon: BarChart3, label: "Reports" }],
  },
];

const ARTIST_TOOLS: Record<OnboardingStep, NavItem[]> = {
  OPEN_ISSUER: [{ href: "/", icon: Rocket, label: "Get started", exact: true }],
  WAITING_FOR_APPROVAL: [{ href: "/", icon: Rocket, label: "Get started", exact: true }],
  READY: [],
  REJECTED: [{ href: "/", icon: Rocket, label: "Apply again", exact: true }],
  BANNED: [],
};

/**
 * What the sidebar shows. Artist tools unlock one step at a time (apply, pay to
 * open the issuer, wait for approval, then the full portal); admins also get
 * the admin group whatever their own artist status is.
 */
export function navFor({ signedIn, step, isAdmin }: PortalNavInput): NavGroup[] {
  if (!signedIn) return [];
  const items: NavItem[] = step === null ? [{ href: "/", icon: BadgeCheck, label: "Become an artist", exact: true }] : ARTIST_TOOLS[step];
  const groups: NavGroup[] = step === "READY" ? [...READY_TOOLS] : [];
  if (items.length > 0) groups.push({ title: "Artist", items });
  if (isAdmin) groups.push(ADMIN);
  return groups;
}

const under = (prefix: string, pathname: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);

export function isActive(entry: NavItem, pathname: string) {
  if (entry.exact) return pathname === entry.href;
  return under(entry.href, pathname) && !entry.exclude?.some((prefix) => under(prefix, pathname));
}

const PHONE_TABS = 4;

/** A phone's tab bar shows the items marked `tab` (else the first few); "More" opens the rest and the account. */
export function phoneTabs(groups: NavGroup[], signedIn: boolean): { tabs: NavItem[]; more: boolean } {
  const all = groups.flatMap((group) => group.items);
  const marked = all.filter((entry) => entry.tab);
  return { tabs: (marked.length > 0 ? marked : all).slice(0, PHONE_TABS), more: signedIn };
}
