import { Keypair } from "@stellar/stellar-sdk";
import { beforeEach, describe, expect, it } from "vitest";

import { AppError, ErrorCodes } from "@bandcoin/errors";

import { chainConfig } from "../server/config";
import { clearRateCache, liveBandcoinUsd, liveRates, TESTNET_BANDCOIN_USD } from "../server/rates";
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
    expect(() =>
      decryptSecret(
        stored.replace(/.$/, (c) => (c === "0" ? "1" : "0")),
        KEY,
      ),
    ).toThrow();
    expect(() => encryptSecret("secret", "short")).toThrow();
  });
});

describe("chainConfig mother account", () => {
  const base = {
    NEXT_PUBLIC_STELLAR_NETWORK: "testnet",
    NEXT_PUBLIC_ASSET_CODE: "BANDCOIN",
    NEXT_PUBLIC_ASSET_ISSUER: Keypair.random().publicKey(),
    PLATFORM_TREASURY: Keypair.random().publicKey(),
  };

  it("exposes only the public key of MOTHER_SECRET", () => {
    const mother = Keypair.random();
    const config = chainConfig({ ...base, MOTHER_SECRET: mother.secret() });
    expect(config.mother).toBe(mother.publicKey());
    expect(JSON.stringify(config)).not.toContain(mother.secret());
  });

  it("is null when there is no mother key, so the rest of the app still starts", () => {
    expect(chainConfig(base).mother).toBeNull();
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
    await expect(liveRates(async () => ({ price: 0 }), 0)).rejects.toMatchObject({
      code: "EXTERNAL_SERVICE_FAILED",
    });
  });
});

describe("liveBandcoinUsd", () => {
  beforeEach(clearRateCache);
  const asset = { code: "BANDCOIN", issuer: "GISSUER" };

  it("on mainnet reads the market price of the asset and caches it for a minute", async () => {
    const urls: string[] = [];
    const fetcher = async (url: string) => {
      urls.push(url);
      return { price: 0.0023 };
    };
    expect(await liveBandcoinUsd({ name: "mainnet", asset }, fetcher, 0)).toBe("0.0023000");
    await liveBandcoinUsd({ name: "mainnet", asset }, fetcher, 30_000);
    expect(urls).toEqual(["https://api.stellar.expert/explorer/public/asset/BANDCOIN-GISSUER"]);
  });

  it("on mainnet refuses when the market has no price or can't be reached, with no fallback", async () => {
    for (const fetcher of [
      async () => ({}),
      async () => ({ price: null }),
      () => Promise.reject(new Error("offline")),
    ]) {
      await expect(liveBandcoinUsd({ name: "mainnet", asset }, fetcher, 0)).rejects.toMatchObject({
        code: "EXTERNAL_SERVICE_FAILED",
        message: "Couldn't load the BANDCOIN price. Try again in a moment.",
      });
    }
  });

  it("on testnet uses the fixed price and never asks the market", async () => {
    const never = () =>
      Promise.reject(new AppError(ErrorCodes.INTERNAL, { message: "must not call the network" }));
    expect(TESTNET_BANDCOIN_USD).toBe("0.00231");
    expect(await liveBandcoinUsd({ name: "testnet", asset }, never, 0)).toBe("0.0023100");
  });
});
