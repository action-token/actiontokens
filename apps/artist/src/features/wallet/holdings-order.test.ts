import { describe, expect, it } from "vitest";

import { orderMain, orderStorage, pageList, storagePreview } from "./holdings-order";

type Kind = "xlm" | "bandcoin" | "usdc" | "fanToken" | "other";
const h = (code: string, amount: string, kind: Kind = "other") => ({ code, amount, kind });
const codes = (list: { code: string }[]) => list.map((entry) => entry.code);

describe("orderStorage", () => {
  it("puts your fan token, then BANDCOIN, then the largest amounts", () => {
    expect(
      codes(
        orderStorage([
          h("XLM", "0.5", "xlm"),
          h("SONG", "900"),
          h("BANDCOIN", "5", "bandcoin"),
          h("TAMSIN", "10", "fanToken"),
          h("POSTER", "40"),
        ]),
      ),
    ).toEqual(["TAMSIN", "BANDCOIN", "SONG", "POSTER", "XLM"]);
  });
});

describe("storagePreview", () => {
  it("lists at most 3 in that order, skips empty ones, and counts the rest", () => {
    const many = [
      h("BANDCOIN", "0", "bandcoin"),
      ...Array.from({ length: 40 }, (_, i) => h(`T${i}`, String(i + 1))),
    ];
    const { shown, more } = storagePreview(many);
    expect(codes(shown)).toEqual(["T39", "T38", "T37"]);
    expect(more).toBe(37);
  });

  it("is empty when nothing is held", () => {
    expect(storagePreview([h("XLM", "0", "xlm")])).toEqual({ shown: [], more: 0 });
  });
});

describe("orderMain", () => {
  it("keeps BANDCOIN, XLM and USDC on top, then the fan token, then by amount", () => {
    expect(
      codes(
        orderMain([
          h("OTHER", "5"),
          h("USDC", "0", "usdc"),
          h("XLM", "9", "xlm"),
          h("BIG", "500"),
          h("TAMSIN", "1", "fanToken"),
          h("BANDCOIN", "199", "bandcoin"),
        ]),
      ),
    ).toEqual(["BANDCOIN", "XLM", "USDC", "TAMSIN", "BIG", "OTHER"]);
  });
});

describe("pageList", () => {
  it("shows 10, and Show all reveals the rest", () => {
    const list = Array.from({ length: 25 }, (_, i) => i);
    expect(pageList(list, false)).toEqual({ shown: list.slice(0, 10), hidden: 15 });
    expect(pageList(list, true).shown).toHaveLength(25);
    expect(pageList([1, 2], false).hidden).toBe(0);
  });
});
