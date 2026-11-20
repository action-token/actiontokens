import { describe, expect, it } from "vitest";

import { fromStroops, originShares, quarterShares, toStroops } from "../shares";

const plots = (n: number) => Array.from({ length: n }, () => ({}));

describe("stroops", () => {
  it("converts both ways without float drift", () => {
    expect(toStroops("0.1") + toStroops("0.2")).toBe(toStroops("0.3"));
    expect(fromStroops(toStroops("12.5"))).toBe("12.5000000");
    expect(toStroops(3)).toBe(30_000_000n);
  });
});

describe("originShares", () => {
  const holders = [
    { pubkey: "A", plotBal: 1, plots: plots(2) },
    { pubkey: "B", plotBal: 1, plots: plots(1) },
    { pubkey: "C", plotBal: 1, plots: plots(1) },
  ];

  it("splits by plotBal × plots and pays out exactly the pot", () => {
    const pot = toStroops("100");
    const shares = originShares(holders, new Set(), pot);
    expect(shares.reduce((s, x) => s + x.stroops, 0n)).toBe(pot);
    expect(shares.find((s) => s.pubkey === "A")!.stroops).toBe(toStroops("50"));
  });

  it("never loses a stroop to rounding", () => {
    const pot = toStroops("100");
    const shares = originShares(
      [
        { pubkey: "A", plotBal: 1, plots: plots(1) },
        { pubkey: "B", plotBal: 1, plots: plots(1) },
        { pubkey: "C", plotBal: 1, plots: plots(1) },
      ],
      new Set(),
      pot,
    );
    expect(shares.reduce((s, x) => s + x.stroops, 0n)).toBe(pot);
  });

  it("gives a blocked wallet's share to the others", () => {
    const shares = originShares(holders, new Set(["A"]), toStroops("100"));
    expect(shares.map((s) => s.pubkey)).toEqual(["B", "C"]);
    expect(shares[0]!.stroops).toBe(toStroops("50"));
  });

  it("pays nothing when there's no pot or no holder", () => {
    expect(originShares(holders, new Set(), 0n).every((s) => s.stroops === 0n)).toBe(true);
    expect(originShares([], new Set(), toStroops("5"))).toEqual([]);
  });
});

describe("quarterShares", () => {
  it("pays one unit per 1,000 held and skips blocked wallets", () => {
    const shares = quarterShares(
      [
        { accountId: "A", action: 5000 },
        { accountId: "B", action: 250 },
        { accountId: "X", action: 9000 },
      ],
      new Set(["X"]),
    );
    expect(shares).toEqual([
      { pubkey: "A", stroops: toStroops("5") },
      { pubkey: "B", stroops: toStroops("0.25") },
    ]);
  });
});
