import { describe, expect, it } from "vitest";

import { isActive, navFor, phoneTabs, type PortalNavInput } from "./nav";

const labels = (input: PortalNavInput) =>
  navFor(input).flatMap((group) => group.items.map((entry) => entry.label));

describe("portal navigation", () => {
  it("shows only the way in to someone who is not an artist yet", () => {
    expect(labels({ signedIn: true, step: null, isAdmin: false })).toEqual(["Become an artist"]);
  });

  it("shows no links to someone who is signed out", () => {
    expect(navFor({ signedIn: false, step: null, isAdmin: false })).toEqual([]);
  });

  it("keeps an applicant on onboarding until an admin approves", () => {
    expect(labels({ signedIn: true, step: "OPEN_ISSUER", isAdmin: false })).toEqual([
      "Get started",
    ]);
    expect(labels({ signedIn: true, step: "WAITING_FOR_APPROVAL", isAdmin: false })).toEqual([
      "Get started",
    ]);
  });

  it("sends a rejected applicant back to the form", () => {
    expect(labels({ signedIn: true, step: "REJECTED", isAdmin: false })).toEqual(["Apply again"]);
  });

  it("opens the artist tools once approved", () => {
    expect(labels({ signedIn: true, step: "READY", isAdmin: false })).toEqual([
      "Map & pins",
      "Events",
      "Website map",
      "My page",
      "Posts",
      "Bounties",
      "Music",
      "Items",
      "Memberships",
      "Gifts",
      "Earnings",
    ]);
  });

  it("shows nothing to a banned artist", () => {
    expect(navFor({ signedIn: true, step: "BANNED", isAdmin: false })).toEqual([]);
  });

  it("adds the admin group for admins, even before they are artists", () => {
    expect(
      navFor({ signedIn: true, step: null, isAdmin: true }).map((group) => group.title),
    ).toEqual(["Artist", "Admin"]);
    expect(labels({ signedIn: true, step: "READY", isAdmin: true })).toEqual([
      "Map & pins",
      "Events",
      "Website map",
      "My page",
      "Posts",
      "Bounties",
      "Music",
      "Items",
      "Memberships",
      "Gifts",
      "Earnings",
      "Artists",
      "Mural review",
      "Activity",
    ]);
  });

  it("lists the drops first, as Wadzzo's brand portal does", () => {
    expect(
      navFor({ signedIn: true, step: "READY", isAdmin: false }).map((group) => group.title),
    ).toEqual(["Drops", "Content", "Sell"]);
  });

  it("keeps Items lit on its nested pages", () => {
    const items = navFor({ signedIn: true, step: "READY", isAdmin: false })[2]!.items.find(
      (entry) => entry.label === "Items",
    );
    expect(isActive(items!, "/items")).toBe(true);
    expect(isActive(items!, "/items/new")).toBe(true);
    expect(isActive(items!, "/")).toBe(false);
  });

  it("keeps the menu short: one entry lights for every page it covers", () => {
    const entries = navFor({ signedIn: true, step: "READY", isAdmin: false }).flatMap(
      (group) => group.items,
    );
    const lit = (pathname: string) =>
      entries.filter((entry) => isActive(entry, pathname)).map((entry) => entry.label);
    expect(entries.length).toBeLessThanOrEqual(11);
    expect(lit("/pins")).toEqual(["Map & pins"]);
    expect(lit("/pins/manage")).toEqual(["Map & pins"]);
    expect(lit("/announcements/new")).toEqual(["Posts"]);
    expect(lit("/reports")).toEqual(["Earnings"]);
    expect(lit("/redeem")).toEqual(["Earnings"]);
    expect(lit("/royalty")).toEqual(["Earnings"]);
  });

  it("keeps Artists lit on a nested admin page but not Activity", () => {
    const admin = navFor({ signedIn: true, step: "READY", isAdmin: true }).at(-1);
    const [artists, , activity] = admin!.items;
    expect(isActive(artists!, "/admin/artists/abc")).toBe(true);
    expect(isActive(artists!, "/admin/activity")).toBe(false);
    expect(isActive(activity!, "/admin/activity")).toBe(true);
  });

  it("keeps four tabs on a phone and puts the rest and the account behind More", () => {
    const apply = phoneTabs(navFor({ signedIn: true, step: "OPEN_ISSUER", isAdmin: false }), true);
    expect(apply).toEqual({
      tabs: [expect.objectContaining({ label: "Get started" })],
      more: true,
    });
    const ready = phoneTabs(navFor({ signedIn: true, step: "READY", isAdmin: true }), true);
    expect(ready.tabs.map((entry) => entry.shortLabel ?? entry.label)).toEqual([
      "Map",
      "Events",
      "Posts",
      "Bounties",
    ]);
    expect(ready.more).toBe(true);
    expect(phoneTabs([], false)).toEqual({ tabs: [], more: false });
  });
});
