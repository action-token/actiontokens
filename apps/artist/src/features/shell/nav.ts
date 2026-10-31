import {
  BadgeCheck,
  BarChart3,
  CalendarDays,
  Code2,
  Coins,
  Crown,
  FileText,
  Frame,
  Gift,
  LayoutTemplate,
  ListChecks,
  Map,
  MapPinned,
  Mic2,
  Music2,
  Package,
  Rocket,
  TicketCheck,
  Trophy,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { OnboardingStep } from "@bandcoin/api";

export type NavItem = {
  href: string;
  icon: LucideIcon;
  label: string;
  /** What the phone tab bar says when the label is too long for it. */
  shortLabel?: string;
  exact?: boolean;
  /** Other pages this entry covers, reached from tabs or links on its page (e.g. /announcements under Posts). */
  also?: string[];
  /** One of the four tabs on a phone's bottom bar. */
  tab?: boolean;
};
export type NavGroup = { title: string; items: NavItem[] };
export type SectionTab = Pick<NavItem, "href" | "label">;

/** Pages that share one menu entry and switch with tabs at the top. */
export const POSTS_TABS: SectionTab[] = [
  { href: "/posts", label: "Posts" },
  { href: "/announcements", label: "Announcements" },
];
const pathsOf = (tabs: SectionTab[]) => tabs.slice(1).map((tab) => tab.href);

export type PortalNavInput = {
  signedIn: boolean;
  /** null when the person has not applied yet. */
  step: OnboardingStep | null;
  isAdmin: boolean;
};

const ADMIN: NavGroup = {
  title: "Admin",
  items: [
    { href: "/admin/artists", icon: Mic2, label: "Artists" },
    { href: "/admin/users", icon: Users, label: "Users" },
    { href: "/admin/admins", icon: ShieldCheck, label: "Admins" },
    { href: "/admin/pins", icon: MapPinned, label: "Pin review" },
    { href: "/admin/murals", icon: Frame, label: "Mural review" },
    { href: "/admin/bounties", icon: Trophy, label: "Bounties" },
    { href: "/admin/items", icon: Package, label: "Items" },
    { href: "/admin/settings", icon: SlidersHorizontal, label: "Settings" },
    { href: "/admin/activity", icon: ListChecks, label: "Activity" },
  ],
};

/**
 * An approved artist's tools, drops first (as in Wadzzo's brand portal). Kept
 * short on purpose: pages that belong together share one entry.
 */
const READY_TOOLS: NavGroup[] = [
  {
    title: "Drops",
    items: [
      { href: "/pins", icon: Map, label: "Map & pins", shortLabel: "Map", tab: true },
      { href: "/events", icon: CalendarDays, label: "Events", tab: true },
      { href: "/embeds", icon: Code2, label: "Website map" },
      { href: "/reports", icon: BarChart3, label: "Pin reports" },
      { href: "/redeem", icon: TicketCheck, label: "Redeem" },
    ],
  },
  {
    title: "Content",
    items: [
      { href: "/page", icon: LayoutTemplate, label: "My page" },
      { href: "/posts", icon: FileText, label: "Posts", also: pathsOf(POSTS_TABS), tab: true },
      { href: "/bounties", icon: Trophy, label: "Bounties", tab: true },
    ],
  },
  {
    title: "Sell",
    items: [
      { href: "/music", icon: Music2, label: "Music" },
      { href: "/items", icon: Package, label: "Items" },
      { href: "/memberships", icon: Crown, label: "Memberships" },
      { href: "/gifts", icon: Gift, label: "Gifts" },
      { href: "/royalty", icon: Coins, label: "Royalties" },
    ],
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
  const items: NavItem[] =
    step === null
      ? [{ href: "/", icon: BadgeCheck, label: "Become an artist", exact: true }]
      : ARTIST_TOOLS[step];
  const groups: NavGroup[] = step === "READY" ? [...READY_TOOLS] : [];
  if (items.length > 0) groups.push({ title: "Artist", items });
  if (isAdmin) groups.push(ADMIN);
  return groups;
}

const under = (prefix: string, pathname: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

export function isActive(entry: Pick<NavItem, "href" | "exact" | "also">, pathname: string) {
  if (entry.exact) return pathname === entry.href;
  return [entry.href, ...(entry.also ?? [])].some((prefix) => under(prefix, pathname));
}

const PHONE_TABS = 4;

/** A phone's tab bar shows the items marked `tab` (else the first few); "More" opens the rest and the account. */
export function phoneTabs(
  groups: NavGroup[],
  signedIn: boolean,
): { tabs: NavItem[]; more: boolean } {
  const all = groups.flatMap((group) => group.items);
  const marked = all.filter((entry) => entry.tab);
  return { tabs: (marked.length > 0 ? marked : all).slice(0, PHONE_TABS), more: signedIn };
}
