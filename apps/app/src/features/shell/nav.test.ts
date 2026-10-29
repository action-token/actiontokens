import { describe, expect, it } from "vitest";

import { artistEntry, GROUPS, isActive } from "./nav";

const item = (label: string) => GROUPS.flatMap((group) => group.items).find((entry) => entry.label === label)!;

describe("sidebar", () => {
  it("groups the links: browse, library, account", () => {
    expect(GROUPS.map((group) => group.title)).toEqual(["Browse", "Library", "Account"]);
    expect(GROUPS[2]!.items.map((entry) => entry.label)).toEqual(["Wallet", "Settings"]);
  });

  it("highlights exactly one entry on the collection page: the tab you're on", () => {
    const active = (tab: string | null) => GROUPS.flatMap((group) => group.items).filter((entry) => isActive(entry, "/collection", tab)).map((entry) => entry.label);
    expect(active(null)).toEqual(["My collection"]);
    expect(active("songs")).toEqual(["My collection"]);
    expect(active("favorites")).toEqual(["Favourites"]);
  });

  it("matches nested pages, but home only on home, and never external links", () => {
    expect(isActive(item("Home"), "/", null)).toBe(true);
    expect(isActive(item("Home"), "/marketplace", null)).toBe(false);
    expect(isActive(item("Bounties"), "/bounty/abc", null)).toBe(true);
    expect(isActive(item("Playlists"), "/playlist/p1", null)).toBe(true);
  });

  it("keeps AR and the artist portal out of the link list: they are launch tiles", () => {
    expect(GROUPS[0]!.items.map((entry) => entry.label)).toEqual(["Home", "Marketplace", "Bounties"]);
  });
});

describe("artistEntry", () => {
  it("invites a fan to become an artist", () => {
    expect(artistEntry(null)).toMatchObject({ title: "Become an artist", hint: "Open your page" });
  });

  it("tells a rejected applicant, so they can open the portal and apply again", () => {
    expect(artistEntry({ name: "Luna Vale", status: "REJECTED" })).toMatchObject({ title: "Artist portal", hint: "Not approved" });
  });

  it("follows the application: in review, ready, and banned", () => {
    expect(artistEntry({ name: "Luna Vale", status: "PENDING" })).toMatchObject({ title: "Artist portal", hint: "In review" });
    expect(artistEntry({ name: "Luna Vale", status: "APPROVED" })).toMatchObject({ title: "Artist portal", hint: "Luna Vale" });
    expect(artistEntry({ name: "Luna Vale", status: "BANNED" })).toMatchObject({ title: "Artist portal", hint: "Account status" });
  });
});
