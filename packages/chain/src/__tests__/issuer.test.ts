import {
  Account,
  Keypair,
  Networks,
  type Transaction,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";

import {
  buildIssuerRefund,
  buildStockStorage,
  buildStorageWithdraw,
  buildStorageSetup,
  quoteIssuerSetup,
  quoteStorageSetup,
  storageStartingXlm,
} from "../classic/issuer";

const network = { passphrase: Networks.TESTNET, baseFee: "100" };
const parse = (xdr: string) => TransactionBuilder.fromXDR(xdr, Networks.TESTNET) as Transaction;

describe("quoteIssuerSetup", () => {
  it("shows the 1.5 XLM, the network fee and the total, in that order", () => {
    const quote = quoteIssuerSetup({ xlmFunds: "10", networkFeeXlm: "0.00001" });
    expect(quote.ok).toBe(true);
    expect(quote.lines.map((line) => [line.key, line.currency, line.amount])).toEqual([
      ["account", "XLM", "1.5"],
      ["networkFee", "XLM", "0.00001"],
      ["total", "XLM", "1.50001"],
    ]);
    expect(quote.total).toBe("1.5000100");
  });

  it("says how much XLM is missing when the wallet can't cover it", () => {
    const quote = quoteIssuerSetup({ xlmFunds: "1", networkFeeXlm: "0.00001" });
    expect(quote.ok).toBe(false);
    expect(quote.problems).toEqual([
      {
        code: "INSUFFICIENT_FUNDS",
        message: "You need 0.50001 more XLM to open your artist account.",
        shortfall: { currency: "XLM", need: "1.50001", have: "1", short: "0.50001" },
      },
    ]);
  });

  it("asks to sign in when there is no wallet to read", () => {
    expect(quoteIssuerSetup({ xlmFunds: null, networkFeeXlm: "0.00001" }).problems).toEqual([
      { code: "SIGN_IN", message: "Sign in to pay." },
    ]);
  });

  it("accepts exactly enough", () => {
    expect(quoteIssuerSetup({ xlmFunds: "1.50001", networkFeeXlm: "0.00001" }).ok).toBe(true);
  });
});

describe("buildIssuerRefund", () => {
  it("merges the issuer back into the artist's wallet, signed by the issuer", () => {
    const issuer = Keypair.random().publicKey();
    const artist = Keypair.random().publicKey();
    const built = buildIssuerRefund({ issuer: new Account(issuer, "7"), network, artist });
    const tx = parse(built.xdr);
    expect(tx.source).toBe(issuer);
    expect(tx.operations).toHaveLength(1);
    expect(tx.operations[0]).toMatchObject({ type: "accountMerge", destination: artist });
    expect(built.serverSigners).toEqual([issuer]);
  });
});

describe("storage account", () => {
  it("prices 2.5 XLM plus the fee", () => {
    const quote = quoteStorageSetup({ xlmFunds: "1", networkFeeXlm: "0.00003" });
    expect(quote.total).toBe("2.5000300");
    expect(quote.lines[0]).toMatchObject({ label: "Open your storage account", amount: "2.5" });
    expect(quote.problems[0]?.message).toBe(
      "You need 1.50003 more XLM to open your storage account.",
    );
  });

  it("creates it from the artist's wallet and trusts the payment assets, signed by storage", () => {
    const artist = Keypair.random().publicKey();
    const storage = Keypair.random().publicKey();
    const issuer = Keypair.random().publicKey();
    const built = buildStorageSetup({
      artist: new Account(artist, "3"),
      network,
      storage,
      trust: [
        { code: "Bandcoin", issuer },
        { code: "USDC", issuer },
      ],
    });
    const tx = parse(built.xdr);
    expect(tx.source).toBe(artist);
    expect(tx.operations).toMatchObject([
      { type: "createAccount", destination: storage, startingBalance: "2.5000000" },
      { type: "changeTrust", source: storage },
      { type: "changeTrust", source: storage },
    ]);
    expect(built.serverSigners).toEqual([storage]);
  });

  it("starts with room for every trustline it opens with", () => {
    expect(storageStartingXlm(2)).toBe("2.5");
    expect(storageStartingXlm(3)).toBe("3");
    expect(quoteStorageSetup({ xlmFunds: "10", networkFeeXlm: "0", startingXlm: "3" }).total).toBe(
      "3.0000000",
    );
  });
});

describe("stocking storage", () => {
  const artist = Keypair.random().publicKey();
  const storage = Keypair.random().publicKey();
  const issuer = Keypair.random().publicKey();
  const asset = { code: "SONG1", issuer };

  it("mints copies from the issuer into storage, the artist paying the fee", () => {
    const built = buildStockStorage({
      artist: new Account(artist, "3"),
      network,
      storage,
      issuer,
      asset,
      amount: "10",
      openTrustline: false,
    });
    const tx = parse(built.xdr);
    expect(tx.source).toBe(artist);
    expect(tx.operations).toMatchObject([
      { type: "payment", source: issuer, destination: storage, amount: "10.0000000" },
    ]);
    expect(built.serverSigners).toEqual([issuer]);
  });

  it("first funds and opens storage's trustline when it doesn't hold the token yet", () => {
    const built = buildStockStorage({
      artist: new Account(artist, "3"),
      network,
      storage,
      issuer,
      asset,
      amount: "1",
      openTrustline: true,
    });
    expect(parse(built.xdr).operations).toMatchObject([
      { type: "payment", destination: storage, amount: "0.5000000", asset: { code: "XLM" } },
      { type: "changeTrust", source: storage, line: { code: "SONG1" } },
      { type: "payment", source: issuer, destination: storage },
    ]);
    expect(built.serverSigners).toEqual([issuer, storage]);
  });
});

describe("taking things out of storage", () => {
  const artist = Keypair.random().publicKey();
  const storage = Keypair.random().publicKey();
  const issuer = Keypair.random().publicKey();

  it("pays from storage into the artist's wallet, opening its trustline when needed", () => {
    const built = buildStorageWithdraw({
      artist: new Account(artist, "3"),
      network,
      storage,
      asset: { code: "SONG1", issuer },
      amount: "2",
      openTrustline: true,
    });
    const tx = parse(built.xdr);
    expect(tx.source).toBe(artist);
    expect(tx.operations).toMatchObject([
      { type: "changeTrust", line: { code: "SONG1" } },
      { type: "payment", source: storage, destination: artist, amount: "2.0000000" },
    ]);
    expect(built.serverSigners).toEqual([storage]);
  });

  it("moves XLM with no trustline", () => {
    const built = buildStorageWithdraw({
      artist: new Account(artist, "3"),
      network,
      storage,
      asset: null,
      amount: "1",
      openTrustline: true,
    });
    expect(parse(built.xdr).operations).toMatchObject([
      { type: "payment", source: storage, asset: { code: "XLM" } },
    ]);
  });
});
