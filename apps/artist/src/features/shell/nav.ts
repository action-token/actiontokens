import {
  BadgeCheck,
  BarChart3,
  BellRing,
  CalendarDays,
  Code2,
  Coins,
  Crown,
  FileText,
  Frame,
  Gift,
  LayoutTemplate,
  List,
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
  Wallet,
  Workflow,
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
  /** Other pages this entry covers, reached from tabs or links on its page. */
  also?: string[];
  /** Pages under this entry that belong to another entry instead. */
  except?: string[];
  /** One of the four tabs on a phone's bottom bar. */
  tab?: boolean;
};
export type NavGroup = { title: string; items: NavItem[] };
export type SectionTab = Pick<NavItem, "href" | "label" | "exact">;

/** Events and announcements share one entry and switch with tabs, as in Wadzzo. */
export const EVENTS_TABS: SectionTab[] = [
  { href: "/events", label: "Events", exact: true },
  { href: "/events/announcements", label: "Announcements" },
];

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
    { href: "/admin/reports", icon: BarChart3, label: "Collection reports" },
    { href: "/admin/alerts", icon: BellRing, label: "Alerts" },
    { href: "/admin/jobs", icon: Workflow, label: "Jobs" },
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
      {
        href: "/pins",
        icon: Map,
        label: "Map & pins",
        shortLabel: "Map",
        also: ["/hotspots"],
        except: ["/pins/manage"],
        tab: true,
      },
      { href: "/pins/manage", icon: List, label: "Pin management", shortLabel: "Manage" },
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
      { href: "/posts", icon: FileText, label: "Posts", tab: true },
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
      { href: "/wallet", icon: Wallet, label: "Wallet" },
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
  // Signed out: the artist menu as a preview; every page shows the sign-in card.
  if (!signedIn) return [...READY_TOOLS];
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

export function isActive(
  entry: Pick<NavItem, "href" | "exact" | "also" | "except">,
  pathname: string,
) {
  if (entry.exact) return pathname === entry.href;
  if (entry.except?.some((prefix) => under(prefix, pathname))) return false;
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
