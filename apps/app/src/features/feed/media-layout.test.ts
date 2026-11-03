import { describe, expect, it } from "vitest";

import { clock, mediaLayout } from "./media-layout";

describe("mediaLayout", () => {
  it("lets one photo fill the width", () => {
    expect(mediaLayout(1)).toMatchObject({ shown: 1, extra: 0, grid: "grid-cols-1" });
  });

  it("puts two side by side and three as one big plus two stacked", () => {
    expect(mediaLayout(2)).toMatchObject({
      shown: 2,
      grid: expect.stringContaining("grid-cols-2"),
    });
    const three = mediaLayout(3);
    expect(three.cell(0)).toBe("row-span-2");
    expect(three.cell(1)).toBe("");
  });

  it("shows four and counts the rest on the last tile", () => {
    expect(mediaLayout(4)).toMatchObject({ shown: 4, extra: 0 });
    expect(mediaLayout(7)).toMatchObject({ shown: 4, extra: 3 });
  });
});

describe("clock", () => {
  it("reads like a player", () => {
    expect(clock(0)).toBe("0:00");
    expect(clock(42.7)).toBe("0:42");
    expect(clock(190)).toBe("3:10");
    expect(clock(3725)).toBe("1:02:05");
    expect(clock(Number.NaN)).toBe("0:00");
  });
});
