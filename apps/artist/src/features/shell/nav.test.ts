import { describe, expect, it } from "vitest";

import { isActive, navFor, type PortalNavInput } from "./nav";

const labels = (input: PortalNavInput) => navFor(input).flatMap((group) => group.items.map((entry) => entry.label));

describe("portal navigation", () => {
  it("shows only the way in to someone who is not an artist yet", () => {
    expect(labels({ signedIn: true, step: null, isAdmin: false })).toEqual(["Become an artist"]);
  });

  it("shows no links to someone who is signed out", () => {
    expect(navFor({ signedIn: false, step: null, isAdmin: false })).toEqual([]);
  });

  it("keeps an applicant on onboarding until an admin approves", () => {
    expect(labels({ signedIn: true, step: "OPEN_ISSUER", isAdmin: false })).toEqual(["Get started"]);
    expect(labels({ signedIn: true, step: "WAITING_FOR_APPROVAL", isAdmin: false })).toEqual(["Get started"]);
  });

  it("sends a rejected applicant back to the form", () => {
    expect(labels({ signedIn: true, step: "REJECTED", isAdmin: false })).toEqual(["Apply again"]);
  });

  it("opens the artist tools once approved", () => {
    expect(labels({ signedIn: true, step: "READY", isAdmin: false })).toEqual(["Dashboard", "Items"]);
  });

  it("shows nothing to a banned artist", () => {
    expect(navFor({ signedIn: true, step: "BANNED", isAdmin: false })).toEqual([]);
  });

  it("adds the admin group for admins, even before they are artists", () => {
    expect(navFor({ signedIn: true, step: null, isAdmin: true }).map((group) => group.title)).toEqual(["Artist", "Admin"]);
    expect(labels({ signedIn: true, step: "READY", isAdmin: true })).toEqual(["Dashboard", "Items", "Artists", "Activity"]);
  });

  it("keeps Items lit on its nested pages", () => {
    const [items] = navFor({ signedIn: true, step: "READY", isAdmin: false })[0]!.items.slice(1);
    expect(isActive(items!, "/items")).toBe(true);
    expect(isActive(items!, "/items/new")).toBe(true);
    expect(isActive(items!, "/")).toBe(false);
  });

  it("highlights the dashboard only on the home page", () => {
    const dashboard = navFor({ signedIn: true, step: "READY", isAdmin: false })[0]!.items[0]!;
    expect(isActive(dashboard, "/")).toBe(true);
    expect(isActive(dashboard, "/admin")).toBe(false);
  });

  it("keeps Artists lit on a nested admin page but not Activity", () => {
    const [, admin] = navFor({ signedIn: true, step: "READY", isAdmin: true });
    const [artists, activity] = admin!.items;
    expect(isActive(artists!, "/admin/artists/abc")).toBe(true);
    expect(isActive(artists!, "/admin/activity")).toBe(false);
    expect(isActive(activity!, "/admin/activity")).toBe(true);
  });
});
