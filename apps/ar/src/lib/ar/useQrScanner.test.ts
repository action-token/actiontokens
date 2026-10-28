import { describe, expect, it } from "vitest";

import { pinIdFromScan } from "./useQrScanner";

describe("pinIdFromScan", () => {
  it("reads the pin from a scan link or a card link", () => {
    expect(pinIdFromScan("https://ar.bandcoin.io/scan?pin=cmvs14r6u003b0puxa786vpv3")).toBe("cmvs14r6u003b0puxa786vpv3");
    expect(pinIdFromScan("https://ar.bandcoin.io/collection/cmvs14r6u003b0puxa786vpv3")).toBe("cmvs14r6u003b0puxa786vpv3");
  });

  it("accepts a bare id but nothing else", () => {
    expect(pinIdFromScan("  cmvs14r6u003b0puxa786vpv3 ")).toBe("cmvs14r6u003b0puxa786vpv3");
    expect(pinIdFromScan("WIFI:S:home;T:WPA;P:secret;;")).toBeNull();
    expect(pinIdFromScan("https://example.com/menu")).toBeNull();
    expect(pinIdFromScan("")).toBeNull();
  });
});
