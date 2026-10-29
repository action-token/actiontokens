import { describe, expect, it } from "vitest";

import { GROUPS, isActive } from "./nav";

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
    expect(isActive(item("AR pins"), "/", null)).toBe(false);
  });
});
