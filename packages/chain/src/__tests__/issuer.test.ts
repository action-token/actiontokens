import { Account, Keypair, Networks, type Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";

import { buildIssuerRefund, quoteIssuerSetup } from "../classic/issuer";

const network = { passphrase: Networks.TESTNET, baseFee: "100" };
const parse = (xdr: string) => TransactionBuilder.fromXDR(xdr, Networks.TESTNET) as Transaction;

describe("quoteIssuerSetup", () => {
  it("shows the 1.5 XLM, the network fee and the total, in that order", () => {
    const quote = quoteIssuerSetup({ xlmFunds: "10", networkFeeXlm: "0.00001" });
    expect(quote.ok).toBe(true);
    expect(quote.lines.map((line) => [line.key, line.currency, line.amount])).toEqual([
      ["issuer", "XLM", "1.5"],
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
    expect(quoteIssuerSetup({ xlmFunds: null, networkFeeXlm: "0.00001" }).problems).toEqual([{ code: "SIGN_IN", message: "Sign in to pay." }]);
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
