import { describe, expect, it } from "vitest";

import { isActive, navFor, phoneLabel, phoneTabs, type PortalNavInput } from "./nav";

const labels = (input: PortalNavInput) =>
  navFor(input).flatMap((group) => group.items.map((entry) => entry.label));

describe("portal navigation", () => {
  it("shows only the way in to someone who is not an organization yet", () => {
    expect(labels({ signedIn: true, step: null, isAdmin: false })).toEqual(["Become an org"]);
  });

  it("shows no links to someone who is signed out", () => {
    expect(
      navFor({ signedIn: false, step: null, isAdmin: false }).map((group) => group.title),
    ).toEqual(["Drops", "Content", "Sell"]);
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
      "Pin management",
      "Events",
      "Website map",
      "Pin reports",
      "Redeem",
      "My page",
      "Posts & stories",
      "Bounties",
      "Music",
      "Items",
      "Memberships",
      "Gifts",
      "Royalties",
      "Wallet",
    ]);
  });

  it("shows nothing to a banned artist", () => {
    expect(navFor({ signedIn: true, step: "BANNED", isAdmin: false })).toEqual([]);
  });

  it("adds the admin group for admins, even before they are artists", () => {
    expect(
      navFor({ signedIn: true, step: null, isAdmin: true }).map((group) => group.title),
    ).toEqual(["Organization", "Admin"]);
    expect(labels({ signedIn: true, step: "READY", isAdmin: true })).toEqual([
      "Map & pins",
      "Pin management",
      "Events",
      "Website map",
      "Pin reports",
      "Redeem",
      "My page",
      "Posts & stories",
      "Bounties",
      "Music",
      "Items",
      "Memberships",
      "Gifts",
      "Royalties",
      "Wallet",
      "Overview",
      "Organizations",
      "Users",
      "Admins",
      "Pin review",
      "All maps",
      "Mural review",
      "Story review",
      "Bounties",
      "Items",
      "Domains",
      "Collection reports",
      "Alerts",
      "Jobs",
      "Settings",
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
    expect(entries.length).toBeLessThanOrEqual(15);
    expect(lit("/pins")).toEqual(["Map & pins"]);
    expect(lit("/pins/manage")).toEqual(["Pin management"]);
    expect(lit("/pins/shapes")).toEqual(["Pin management"]);
    expect(lit("/pins/templates")).toEqual(["Pin management"]);
    expect(lit("/pins/new")).toEqual(["Map & pins"]);
    expect(lit("/pins/p1")).toEqual(["Map & pins"]);
    expect(lit("/hotspots/new")).toEqual(["Map & pins"]);
    expect(lit("/events/announcements/new")).toEqual(["Events"]);
    expect(lit("/events/e1")).toEqual(["Events"]);
    expect(lit("/reports")).toEqual(["Pin reports"]);
    expect(lit("/reports/pin1")).toEqual(["Pin reports"]);
    expect(lit("/redeem")).toEqual(["Redeem"]);
    expect(lit("/posts/new")).toEqual(["Posts & stories"]);
    expect(lit("/stories")).toEqual(["Posts & stories"]);
    expect(lit("/royalty")).toEqual(["Royalties"]);
  });

  it("keeps Artists lit on a nested admin page but not Activity", () => {
    const admin = navFor({ signedIn: true, step: "READY", isAdmin: true }).at(-1);
    const find = (label: string) => admin!.items.find((entry) => entry.label === label);
    const [artists, activity] = [find("Organizations"), find("Activity")];
    expect(isActive(artists!, "/admin/artists/abc")).toBe(true);
    expect(isActive(artists!, "/admin/activity")).toBe(false);
    expect(isActive(activity!, "/admin/activity")).toBe(true);
  });

  it("lights Overview only on /admin itself", () => {
    const admin = navFor({ signedIn: true, step: "READY", isAdmin: true }).at(-1);
    const overview = admin!.items[0]!;
    expect(overview).toMatchObject({ label: "Overview", href: "/admin" });
    expect(isActive(overview, "/admin")).toBe(true);
    expect(isActive(overview, "/admin/artists")).toBe(false);
  });

  it("puts Map, Store | AR | Bounties, Pins on a phone's bar, swapping what isn't open yet", () => {
    const label = phoneLabel;
    const ready = phoneTabs(navFor({ signedIn: true, step: "READY", isAdmin: true }));
    expect(ready.left.map(label)).toEqual(["Map", "Store"]);
    expect(ready.right.map(label)).toEqual(["Bounties", "Pins"]);
    // Onboarding: only the step's own entry exists, so it takes the first slot.
    const apply = phoneTabs(navFor({ signedIn: true, step: "OPEN_ISSUER", isAdmin: false }));
    expect(apply.left.map(label)).toEqual(["Get started"]);
    expect(apply.right).toEqual([]);
    // An admin who isn't an artist gets the first admin entries in the open slots.
    const admin = phoneTabs(navFor({ signedIn: true, step: null, isAdmin: true }));
    expect([...admin.left, ...admin.right]).toHaveLength(4);
    expect(phoneTabs([])).toEqual({ left: [], right: [] });
  });
});
