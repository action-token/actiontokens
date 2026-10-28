import { beforeEach, describe, expect, it } from "vitest";

import { clearRateCache, liveRates } from "../server/rates";
import { decryptSecret, encryptSecret } from "../server/secrets";

const KEY = "a".repeat(64);

describe("secrets", () => {
  it("round-trips and never stores the plain secret", () => {
    const secret = "SBEXAMPLEEXAMPLEEXAMPLEEXAMPLEEXAMPLEEXAMPLEEXAMPLEEXAMP";
    const stored = encryptSecret(secret, KEY);
    expect(stored).not.toContain(secret);
    expect(stored.split(":")).toHaveLength(3);
    expect(decryptSecret(stored, KEY)).toBe(secret);
  });

  it("fails with the wrong key or a tampered payload", () => {
    const stored = encryptSecret("secret", KEY);
    expect(() => decryptSecret(stored, "b".repeat(64))).toThrow();
    expect(() => decryptSecret(stored.replace(/.$/, (c) => (c === "0" ? "1" : "0")), KEY)).toThrow();
    expect(() => encryptSecret("secret", "short")).toThrow();
  });
});

describe("liveRates", () => {
  beforeEach(clearRateCache);

  it("uses Stellar Expert, falls back to Binance, and caches for a minute", async () => {
    const calls: string[] = [];
    const fetcher = async (url: string) => {
      calls.push(url);
      if (url.includes("stellar.expert")) throw new Error("down");
      return { price: "0.3123" };
    };
    expect(await liveRates(fetcher, 0)).toEqual({ xlmUsd: "0.3123000", usdcUsd: "1" });
    await liveRates(fetcher, 30_000);
    expect(calls).toHaveLength(2);
    await liveRates(fetcher, 61_000);
    expect(calls).toHaveLength(4);
  });

  it("fails clearly when no price is available", async () => {
    await expect(liveRates(async () => ({ price: 0 }), 0)).rejects.toMatchObject({ code: "EXTERNAL_SERVICE_FAILED" });
  });
});
