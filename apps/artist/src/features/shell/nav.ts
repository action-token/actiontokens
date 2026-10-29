import { BadgeCheck, LayoutDashboard, ListChecks, Rocket, Users, type LucideIcon } from "lucide-react";

import type { OnboardingStep } from "@bandcoin/api";

export type NavItem = { href: string; icon: LucideIcon; label: string; exact?: boolean };
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
    { href: "/admin/activity", icon: ListChecks, label: "Activity" },
  ],
};

const ARTIST_TOOLS: Record<OnboardingStep, NavItem[]> = {
  OPEN_ISSUER: [{ href: "/", icon: Rocket, label: "Get started", exact: true }],
  WAITING_FOR_APPROVAL: [{ href: "/", icon: Rocket, label: "Get started", exact: true }],
  READY: [{ href: "/", icon: LayoutDashboard, label: "Dashboard", exact: true }],
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
  const groups: NavGroup[] = [];
  if (items.length > 0) groups.push({ title: "Artist", items });
  if (isAdmin) groups.push(ADMIN);
  return groups;
}

export function isActive(entry: NavItem, pathname: string) {
  return entry.exact ? pathname === entry.href : pathname === entry.href || pathname.startsWith(`${entry.href}/`);
}
