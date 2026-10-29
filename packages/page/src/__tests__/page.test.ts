import { describe, expect, it } from "vitest";

import {
  BLOCK_DEFS,
  BLOCK_TYPES,
  MAX_BLOCKS,
  makeBlock,
  normalizeBlocks,
  parseBlock,
} from "../blocks";
import { safeUrl, videoEmbed } from "../links";
import { TEMPLATES, blocksOf, templateByKey } from "../templates";
import { DEFAULT_THEME, inkFor, themeSchema, themeVars } from "../theme";

let n = 0;
const uid = () => `u${(n += 1)}`;

describe("links", () => {
  it("only allows plain web addresses", () => {
    expect(safeUrl(" https://example.com/a ")).toBe("https://example.com/a");
    expect(safeUrl("http://example.com")).toBe("http://example.com/");
    for (const bad of [
      "javascript:alert(1)",
      "data:text/html,hi",
      "ftp://x.com",
      "example.com",
      "",
      null,
      5,
    ])
      expect(safeUrl(bad)).toBeNull();
  });

  it("turns YouTube and Vimeo addresses into embeds and refuses the rest", () => {
    expect(videoEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toMatchObject({
      provider: "youtube",
      id: "dQw4w9WgXcQ",
      embedUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    });
    expect(videoEmbed("https://youtu.be/dQw4w9WgXcQ")?.id).toBe("dQw4w9WgXcQ");
    expect(videoEmbed("https://www.youtube.com/shorts/dQw4w9WgXcQ")?.id).toBe("dQw4w9WgXcQ");
    expect(videoEmbed("https://vimeo.com/123456789")).toMatchObject({
      provider: "vimeo",
      embedUrl: "https://player.vimeo.com/video/123456789?dnt=1",
    });
    for (const bad of [
      "https://evil.example/watch?v=dQw4w9WgXcQ",
      "https://www.youtube.com/watch?v=short",
      "https://www.youtube.com/",
      "javascript:alert(1)",
    ])
      expect(videoEmbed(bad)).toBeNull();
  });
});

describe("theme", () => {
  it("reads black on a bright accent and white on a dark one", () => {
    expect(inkFor("#dbdc2c")).toBe("#0c0d05");
    expect(inkFor("#1d4ed8")).toBe("#ffffff");
  });

  it("is a set of CSS variables, and rejects a bad accent", () => {
    expect(themeVars({ ...DEFAULT_THEME, radius: "none", density: "compact" })).toMatchObject({
      "--page-radius": "0px",
      "--page-gap": "0.75rem",
      "--page-accent": DEFAULT_THEME.accent,
    });
    expect(themeSchema.safeParse({ ...DEFAULT_THEME, accent: "red" }).success).toBe(false);
    expect(themeSchema.safeParse(DEFAULT_THEME).success).toBe(true);
  });
});

describe("a block", () => {
  it("starts with its defaults", () => {
    expect(makeBlock("music", "m1")).toEqual({
      uid: "m1",
      type: "music",
      width: 2,
      hidden: false,
      hideWhenEmpty: true,
      settings: { heading: "Popular", count: 5 },
    });
    expect(makeBlock("links", "l1").settings).toEqual({
      heading: "Links",
      showSocials: true,
      links: [],
    });
  });

  it("repairs bad values instead of failing", () => {
    const block = parseBlock({
      uid: "a",
      type: "music",
      width: 9,
      hidden: "yes",
      settings: { heading: 5, count: 500 },
    });
    expect(block).toEqual({
      uid: "a",
      type: "music",
      width: 2,
      hidden: false,
      hideWhenEmpty: true,
      settings: { heading: "Popular", count: 5 },
    });
  });

  it("drops unknown types and blocks with no id", () => {
    expect(parseBlock({ uid: "a", type: "custom-html", settings: {} })).toBeNull();
    expect(parseBlock({ type: "about" })).toBeNull();
    expect(parseBlock("x")).toBeNull();
  });

  it("keeps the good links and videos and drops the unsafe ones", () => {
    const links = parseBlock({
      uid: "l",
      type: "links",
      settings: {
        links: [
          { label: "Shop", url: "https://shop.example" },
          { label: "Bad", url: "javascript:alert(1)" },
          { label: "", url: "https://x.example" },
        ],
      },
    });
    expect(links?.settings.links).toEqual([{ label: "Shop", url: "https://shop.example/" }]);
    const videos = parseBlock({
      uid: "v",
      type: "videos",
      settings: {
        videos: [
          { title: "Live", url: "https://youtu.be/dQw4w9WgXcQ" },
          { title: "Nope", url: "https://evil.example/v" },
        ],
      },
    });
    expect(videos?.settings.videos).toEqual([
      { title: "Live", url: "https://youtu.be/dQw4w9WgXcQ" },
    ]);
  });

  it("limits how many items a list holds", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      label: `L${i}`,
      url: "https://x.example",
    }));
    expect(
      (
        parseBlock({ uid: "l", type: "links", settings: { links: many } })?.settings
          .links as unknown[]
      ).length,
    ).toBe(12);
  });

  it("only keeps a member photo that is a web address", () => {
    const members = parseBlock({
      uid: "b",
      type: "band-members",
      settings: {
        members: [
          { name: "Ana", photoUrl: "javascript:x" },
          { name: "Bo", photoUrl: "https://cdn.example/b.png" },
        ],
      },
    })?.settings.members as { photoUrl?: string }[];
    expect(members.map((m) => m.photoUrl)).toEqual([undefined, "https://cdn.example/b.png"]);
  });
});

describe("a page", () => {
  it("always has exactly one cover, first and full width, even if saved without one", () => {
    const page = normalizeBlocks([{ uid: "a", type: "about", settings: {} }], uid);
    expect(page.map((b) => b.type)).toEqual(["cover", "about"]);
    expect(page[0]).toMatchObject({ width: 4, hidden: false });
  });

  it("moves a stray cover to the top and drops a second one and repeated ids", () => {
    const page = normalizeBlocks(
      [
        { uid: "a", type: "about" },
        { uid: "c1", type: "cover", width: 2, hidden: true },
        { uid: "c2", type: "cover" },
        { uid: "a", type: "links" },
      ],
      uid,
    );
    expect(page.map((b) => [b.uid, b.type])).toEqual([
      ["c1", "cover"],
      ["a", "about"],
    ]);
    expect(page[0]).toMatchObject({ width: 4, hidden: false });
  });

  it("limits the number of blocks and copes with anything", () => {
    const lots = Array.from({ length: 100 }, (_, i) => ({ uid: `x${i}`, type: "about" }));
    expect(normalizeBlocks(lots, uid)).toHaveLength(MAX_BLOCKS);
    expect(normalizeBlocks(null, uid).map((b) => b.type)).toEqual(["cover"]);
    expect(normalizeBlocks("nope", uid)).toHaveLength(1);
  });
});

describe("registry and templates", () => {
  it("describes every block type, with exactly one locked cover", () => {
    expect(Object.keys(BLOCK_DEFS).sort()).toEqual([...BLOCK_TYPES].sort());
    expect(
      Object.values(BLOCK_DEFS)
        .filter((def) => def.locked)
        .map((def) => def.type),
    ).toEqual(["cover"]);
  });

  it("every template starts with the cover and uses real blocks", () => {
    for (const template of TEMPLATES) {
      const blocks = blocksOf(template, uid);
      expect(blocks[0]?.type).toBe("cover");
      expect(normalizeBlocks(blocks, uid)).toHaveLength(blocks.length);
      expect(themeSchema.safeParse(template.theme).success).toBe(true);
    }
    expect(templateByKey("musician")?.name).toBe("Musician");
    expect(templateByKey("nope")).toBeUndefined();
  });
});
