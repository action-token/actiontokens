import { describe, expect, it } from "vitest";

import { storagePreview } from "./storage-preview";

const holding = (code: string, amount: string) => ({ code, amount });

describe("storagePreview", () => {
  it("lists at most 3, however much storage holds", () => {
    const many = Array.from({ length: 40 }, (_, index) => holding(`T${index}`, "1"));
    const { shown, more } = storagePreview(many);
    expect(shown.map((entry) => entry.code)).toEqual(["T0", "T1", "T2"]);
    expect(more).toBe(37);
  });

  it("leaves out empty holdings, and doesn't count them as more", () => {
    const { shown, more } = storagePreview([
      holding("XLM", "0"),
      holding("BANDCOIN", "5"),
      holding("USDC", "0"),
    ]);
    expect(shown.map((entry) => entry.code)).toEqual(["BANDCOIN"]);
    expect(more).toBe(0);
  });

  it("is empty when nothing is held", () => {
    expect(storagePreview([holding("XLM", "0")])).toEqual({ shown: [], more: 0 });
  });
});
