import { describe, expect, it } from "vitest";

import { salesNotSetUp } from "../services/purchase/not-set-up";

describe("salesNotSetUp", () => {
  it("is not set up when the artist's wallet isn't on Stellar", () => {
    expect(salesNotSetUp({ primary: true, sellerOnChain: false, canDeliver: true })).toBe(true);
  });

  it("is not set up when no copy can come from anywhere", () => {
    expect(salesNotSetUp({ primary: true, sellerOnChain: true, canDeliver: false })).toBe(true);
  });

  it("is ready with a wallet and a way to deliver", () => {
    expect(salesNotSetUp({ primary: true, sellerOnChain: true, canDeliver: true })).toBe(false);
  });

  it("never applies to resales, which have their own messages", () => {
    expect(salesNotSetUp({ primary: false, sellerOnChain: false, canDeliver: false })).toBe(false);
  });
});
