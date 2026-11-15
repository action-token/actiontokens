import { describe, expect, it } from "vitest";

import { makeBlock } from "@bandcoin/page/blocks";

import {
  addBlock,
  insertBlock,
  moveBlock,
  moveBlockTo,
  patchBlock,
  removeBlock,
  restoreBlock,
  setSetting,
} from "./draft";

const page = () => [
  makeBlock("cover", "c"),
  makeBlock("about", "a"),
  makeBlock("music", "m"),
  makeBlock("links", "l"),
];
const order = (blocks: { uid: string }[]) => blocks.map((b) => b.uid).join(",");

describe("page draft edits", () => {
  it("adds a block at the end, but never a second cover", () => {
    expect(order(addBlock(page(), "videos", "v"))).toBe("c,a,m,l,v");
    expect(order(addBlock(page(), "cover", "c2"))).toBe("c,a,m,l");
  });

  it("inserts a block right after another one, or at the end if that one is gone", () => {
    expect(order(insertBlock(page(), "videos", "v", "a"))).toBe("c,a,v,m,l");
    expect(order(insertBlock(page(), "videos", "v", "c"))).toBe("c,v,a,m,l");
    expect(order(insertBlock(page(), "videos", "v", "gone"))).toBe("c,a,m,l,v");
    expect(order(insertBlock(page(), "cover", "c2", "a"))).toBe("c,a,m,l");
  });

  it("drops a dragged block at a new place, never above the cover", () => {
    expect(order(moveBlockTo(page(), "l", 1))).toBe("c,l,a,m");
    expect(order(moveBlockTo(page(), "a", 3))).toBe("c,m,l,a");
    expect(order(moveBlockTo(page(), "m", 0))).toBe("c,m,a,l");
    expect(order(moveBlockTo(page(), "c", 2))).toBe("c,a,m,l");
    expect(order(moveBlockTo(page(), "nope", 2))).toBe("c,a,m,l");
  });

  it("moves a block up and down, but never above the cover or off the ends", () => {
    expect(order(moveBlock(page(), "m", -1))).toBe("c,m,a,l");
    expect(order(moveBlock(page(), "m", 1))).toBe("c,a,l,m");
    expect(order(moveBlock(page(), "a", -1))).toBe("c,a,m,l");
    expect(order(moveBlock(page(), "l", 1))).toBe("c,a,m,l");
    expect(order(moveBlock(page(), "c", 1))).toBe("c,a,m,l");
    expect(order(moveBlock(page(), "nope", 1))).toBe("c,a,m,l");
  });

  it("removes a block but keeps the cover", () => {
    expect(order(removeBlock(page(), "m"))).toBe("c,a,l");
    expect(order(removeBlock(page(), "c"))).toBe("c,a,m,l");
  });

  it("puts a removed block back where it was, once", () => {
    const blocks = page();
    const removed = blocks[2]!;
    const without = removeBlock(blocks, "m");
    expect(order(restoreBlock(without, removed, 2))).toBe("c,a,m,l");
    expect(order(restoreBlock(restoreBlock(without, removed, 2), removed, 2))).toBe("c,a,m,l");
    expect(order(restoreBlock(without, removed, 0))).toBe("c,m,a,l");
  });

  it("changes width and visibility, but the cover stays full width and visible", () => {
    const blocks = patchBlock(patchBlock(page(), "a", { width: 3, hidden: true }), "c", {
      width: 1,
      hidden: true,
    });
    expect(blocks.find((b) => b.uid === "a")).toMatchObject({ width: 3, hidden: true });
    expect(blocks.find((b) => b.uid === "c")).toMatchObject({ width: 4, hidden: false });
  });

  it("sets one setting and leaves the rest and the other blocks alone", () => {
    const blocks = setSetting(page(), "a", "body", "Hello");
    expect(blocks.find((b) => b.uid === "a")?.settings).toEqual({
      style: "text",
      heading: "About",
      body: "Hello",
    });
    expect(blocks.find((b) => b.uid === "m")?.settings).toEqual({
      style: "list",
      heading: "Popular",
      count: 5,
    });
  });
});
