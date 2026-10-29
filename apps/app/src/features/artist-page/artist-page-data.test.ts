import { describe, expect, it } from "vitest";

import { makeBlock, type Block } from "@bandcoin/page/blocks";

import { blocksToShow, isBlockEmpty, socialLinks, type ArtistPageData } from "./artist-page-data";

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

  it("drops hidden blocks and empty ones that ask to be hidden, for visitors", () => {
    const shown = blocksToShow(page, artist(), false);
    expect(shown.map((s) => s.block.type)).toEqual(["cover", "about"]);
    expect(shown[1]?.empty).toBe(true);
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
