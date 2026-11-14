import { describe, expect, it } from "vitest";

import { isActive, NAV_GROUPS, PHONE_TABS, TOOL_PAGES } from "./nav";

describe("Studio navigation", () => {
  it("gives every kind of run a page, and lists each page once", () => {
    expect(Object.keys(TOOL_PAGES).sort()).toEqual([
      "IMAGE",
      "MUSIC",
      "SEO",
      "SOCIAL",
      "TEXT",
      "VIDEO",
    ]);
    const hrefs = NAV_GROUPS.flatMap((group) => group.items.map((item) => item.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const page of Object.values(TOOL_PAGES)) expect(hrefs).toContain(page.href);
    expect(PHONE_TABS.left.map((t) => t.label)).toEqual(["Create", "Library"]);
    expect(PHONE_TABS.right.map((t) => t.label)).toEqual(["Artist", "Coins"]);
    expect(PHONE_TABS.right[0]).toMatchObject({ external: true });
  });

  it("marks Create only on the home page, and a tool on its page", () => {
    const create = NAV_GROUPS[0]!.items[0]!;
    expect(isActive(create, "/")).toBe(true);
    expect(isActive(create, "/images")).toBe(false);
    expect(isActive(TOOL_PAGES.IMAGE, "/images")).toBe(true);
    expect(isActive(TOOL_PAGES.SEO, "/social")).toBe(false);
  });
});
