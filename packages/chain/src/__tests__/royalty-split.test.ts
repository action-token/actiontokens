import { describe, expect, it } from "vitest";

import { royaltyPool, splitRoyalty } from "../royalty/split";

describe("royaltyPool", () => {
  it("is the share of the revenue the item gives its holders", () => {
    expect(royaltyPool("1000", "20")).toBe("200.0000000");
    expect(royaltyPool("100", "12.5")).toBe("12.5000000");
  });
});

describe("splitRoyalty", () => {
  it("pays by share of the whole supply, so unsold tokens stay with the artist", () => {
    // pool 200, supply 100, 40 sold: each token is worth 2
    const { shares, paid, kept } = splitRoyalty({
      pool: "200",
      supply: 100,
      holders: [
        { address: "GA", balance: "30" },
        { address: "GB", balance: "10" },
      ],
    });
    expect(shares).toEqual([
      { address: "GA", balance: "30", amount: "60.0000000" },
      { address: "GB", balance: "10", amount: "20.0000000" },
    ]);
    expect(paid).toBe("80.0000000");
    expect(kept).toBe("120.0000000");
  });

  it("rounds down to the stroop and never pays out more than the pool", () => {
    const { shares, paid, kept } = splitRoyalty({
      pool: "1",
      supply: 3,
      holders: [
        { address: "GA", balance: "1" },
        { address: "GB", balance: "1" },
        { address: "GC", balance: "1" },
      ],
    });
    expect(shares.map((share) => share.amount)).toEqual(["0.3333333", "0.3333333", "0.3333333"]);
    expect(paid).toBe("0.9999999");
    expect(kept).toBe("0.0000001");
  });

  it("leaves out holders whose share rounds to nothing", () => {
    const { shares } = splitRoyalty({
      pool: "0.0000001",
      supply: 10,
      holders: [{ address: "GA", balance: "1" }],
    });
    expect(shares).toEqual([]);
  });

  it("caps a balance above the supply (bad data) at the whole pool", () => {
    const { shares, paid } = splitRoyalty({
      pool: "10",
      supply: 5,
      holders: [{ address: "GA", balance: "50" }],
    });
    expect(shares[0]?.amount).toBe("10.0000000");
    expect(paid).toBe("10.0000000");
  });

  it("needs a real supply", () => {
    expect(() => splitRoyalty({ pool: "1", supply: 0, holders: [] })).toThrow(RangeError);
  });
});
