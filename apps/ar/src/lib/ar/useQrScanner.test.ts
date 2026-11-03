import { describe, expect, it } from "vitest";

import { pinIdFromScan, postIdFromScan } from "./useQrScanner";

describe("pinIdFromScan", () => {
  it("reads the pin from a scan link or a card link", () => {
    expect(pinIdFromScan("https://ar.bandcoin.io/scan?pin=cmvs14r6u003b0puxa786vpv3")).toBe(
      "cmvs14r6u003b0puxa786vpv3",
    );
    expect(pinIdFromScan("https://ar.bandcoin.io/collection/cmvs14r6u003b0puxa786vpv3")).toBe(
      "cmvs14r6u003b0puxa786vpv3",
    );
  });

  it("accepts a bare id but nothing else", () => {
    expect(pinIdFromScan("  cmvs14r6u003b0puxa786vpv3 ")).toBe("cmvs14r6u003b0puxa786vpv3");
    expect(pinIdFromScan("WIFI:S:home;T:WPA;P:secret;;")).toBeNull();
    expect(pinIdFromScan("https://example.com/menu")).toBeNull();
    expect(pinIdFromScan("")).toBeNull();
  });
});

describe("postIdFromScan", () => {
  it("reads the post from a feed post's collect code", () => {
    expect(postIdFromScan("https://ar.bandcoin.io/scan?post=cmw02c99n001oxbuxmyr6ptui")).toBe(
      "cmw02c99n001oxbuxmyr6ptui",
    );
  });

  it("leaves pins, bare ids and odd values alone", () => {
    expect(postIdFromScan("https://ar.bandcoin.io/scan?pin=cmvs14r6u003b0puxa786vpv3")).toBeNull();
    expect(pinIdFromScan("https://ar.bandcoin.io/scan?post=cmw02c99n001oxbuxmyr6ptui")).toBeNull();
    expect(postIdFromScan("cmw02c99n001oxbuxmyr6ptui")).toBeNull();
    expect(postIdFromScan("https://ar.bandcoin.io/scan?post=../../x")).toBeNull();
  });
});
