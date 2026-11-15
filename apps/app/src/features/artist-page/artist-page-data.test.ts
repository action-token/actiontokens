import { describe, expect, it } from "vitest";

import { makeBlock, type Block } from "@bandcoin/page/blocks";

import {
  blocksToShow,
  isBlockEmpty,
  rowSpans,
  socialLinks,
  type ArtistPageData,
} from "./artist-page-data";

const artist = (over: Partial<ArtistPageData> = {}) =>
  ({
    website: null,
    twitter: null,
    instagram: null,
    popular: [],
    albums: [],
    forSale: [],
    tiers: [],
    events: [],
    ...over,
  }) as unknown as ArtistPageData;

const block = (type: Parameters<typeof makeBlock>[0], over: Partial<Block> = {}) => ({
  ...makeBlock(type, `b-${type}`),
  ...over,
});

describe("socialLinks", () => {
  it("builds addresses from handles and keeps a website as is", () => {
    expect(
      socialLinks(
        artist({ website: "https://luna.example", instagram: "@luna", twitter: "luna_v" }),
      ),
    ).toEqual([
      { label: "Website", href: "https://luna.example" },
      { label: "Instagram", href: "https://instagram.com/luna" },
      { label: "X", href: "https://x.com/luna_v" },
    ]);
    expect(socialLinks(artist())).toEqual([]);
  });
});

describe("isBlockEmpty", () => {
  it("looks at the data a block shows", () => {
    expect(isBlockEmpty(block("music"), artist())).toBe(true);
    expect(isBlockEmpty(block("music"), artist({ popular: [{ id: "1" }] as never }))).toBe(false);
    expect(isBlockEmpty(block("tour"), artist({ events: [{ id: "e" }] as never }))).toBe(false);
    expect(isBlockEmpty(block("membership"), artist())).toBe(true);
  });

  it("looks at what the artist typed for settings blocks", () => {
    expect(isBlockEmpty(block("about"), artist())).toBe(true);
    expect(
      isBlockEmpty(block("about", { settings: { heading: "About", body: "  hi " } }), artist()),
    ).toBe(false);
    expect(isBlockEmpty(block("videos"), artist())).toBe(true);
  });

  it("counts socials as links only when they are switched on", () => {
    const withSocials = artist({ instagram: "luna" });
    expect(isBlockEmpty(block("links"), withSocials)).toBe(false);
    expect(
      isBlockEmpty(
        block("links", { settings: { heading: "Links", showSocials: false, links: [] } }),
        withSocials,
      ),
    ).toBe(true);
  });

  it("never calls the cover empty", () => {
    expect(isBlockEmpty(block("cover"), artist())).toBe(false);
  });
});

describe("blocksToShow", () => {
  const page = [
    block("cover"),
    block("music"),
    block("about", { hideWhenEmpty: false }),
    block("releases", { hidden: true }),
  ];

  it("drops hidden blocks and every empty block, for visitors", () => {
    const shown = blocksToShow(page, artist(), false);
    // "about" is empty: even with "hide when empty" off, fans don't see it.
    expect(shown.map((s) => s.block.type)).toEqual(["cover"]);
  });

  it("shows a block once it has something", () => {
    const filled = [block("cover"), block("about", { settings: { heading: "About", body: "Hi" } })];
    expect(blocksToShow(filled, artist(), false).map((s) => s.block.type)).toEqual([
      "cover",
      "about",
    ]);
  });

  it("keeps everything while editing so each block can be selected", () => {
    expect(blocksToShow(page, artist(), true).map((s) => s.block.type)).toEqual([
      "cover",
      "music",
      "about",
      "releases",
    ]);
  });
});

describe("rowSpans", () => {
  it("keeps rows that already add up to four columns", () => {
    expect(rowSpans([4, 2, 2, 1, 3, 1, 1, 1, 1])).toEqual([4, 2, 2, 1, 3, 1, 1, 1, 1]);
  });

  it("stretches the last block of an unfinished row to the end of it", () => {
    // ½ then full: the half fills its row. ¾ then ½: the ¾ fills its row.
    expect(rowSpans([2, 4, 3, 2, 4])).toEqual([4, 4, 4, 4, 4]);
    expect(rowSpans([1, 1, 4])).toEqual([1, 3, 4]);
    expect(rowSpans([2, 1, 2, 2])).toEqual([2, 2, 2, 2]);
  });

  it("fills the last row, and copes with no blocks", () => {
    expect(rowSpans([4, 1])).toEqual([4, 4]);
    expect(rowSpans([1, 1, 1])).toEqual([1, 1, 2]);
    expect(rowSpans([])).toEqual([]);
  });
});
