import { describe, expect, it } from "vitest";

import { assetCodeFrom, normalizeAssetCode, validateAssetCode, validatePrice } from "../asset-code";

describe("normalizeAssetCode", () => {
  it("trims and upper-cases", () => {
    expect(normalizeAssetCode("  nightdrv ")).toBe("NIGHTDRV");
  });
});

describe("assetCodeFrom", () => {
  it("keeps letters and numbers, upper-cased, up to 12", () => {
    expect(assetCodeFrom("Luna Vale")).toBe("LUNAVALE");
    expect(assetCodeFrom("Beyoncé & Co.")).toBe("BEYONCECO");
    expect(assetCodeFrom("The Night Drivers Band")).toBe("THENIGHTDRIV");
  });

  it("is empty when nothing usable is left", () => {
    expect(assetCodeFrom("!!!")).toBe("");
  });
});

describe("validateAssetCode", () => {
  it("accepts 1 to 12 letters and numbers", () => {
    expect(validateAssetCode("NIGHTDRV")).toBeNull();
    expect(validateAssetCode("A")).toBeNull();
    expect(validateAssetCode("ABCDEFGHIJK2")).toBeNull();
  });

  it("explains what's wrong", () => {
    expect(validateAssetCode("")).toBe("Enter a code");
    expect(validateAssetCode("ABCDEFGHIJKLM")).toBe("Use at most 12 characters");
    expect(validateAssetCode("NIGHT-DRV")).toBe("Use only letters and numbers");
    expect(validateAssetCode("NÍGHT")).toBe("Use only letters and numbers");
  });

  it("keeps the platform's own currencies for the platform", () => {
    for (const code of ["BANDCOIN", "XLM", "USDC", "USD"])
      expect(validateAssetCode(code)).toBe("That code is reserved");
  });
});

describe("validatePrice", () => {
  it("accepts a positive amount with up to 7 decimals", () => {
    expect(validatePrice("25")).toBeNull();
    expect(validatePrice("0.0000001")).toBeNull();
    expect(validatePrice("1999.99")).toBeNull();
  });

  it("refuses zero, negatives, too many decimals and junk", () => {
    expect(validatePrice("0")).toBe("Enter a price above zero");
    expect(validatePrice("0.0000000")).toBe("Enter a price above zero");
    expect(validatePrice("-1")).toBe("Enter a valid price");
    expect(validatePrice("1.12345678")).toBe("Use at most 7 decimals");
    expect(validatePrice("abc")).toBe("Enter a valid price");
    expect(validatePrice("")).toBe("Enter a valid price");
  });

  it("caps the size so no amount overflows", () => {
    expect(validatePrice("10000000000")).toBe("That price is too high");
  });
});
