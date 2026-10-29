import {
  Account,
  Asset,
  Keypair,
  Networks,
  scValToNative,
  type Transaction,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";

import { buildNftRegisterEdition, NFT_MAX_SUPPLY, tokenAddressOf } from "../nft/calls";

const network = { passphrase: Networks.TESTNET, baseFee: "100" };
const key = () => Keypair.random().publicKey();
const artist = key();
const authority = key();
const creator = key();
const contract = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
const bandcoin = new Asset("BANDCOIN", key());

const base = () => ({
  source: new Account(artist, "10"),
  network,
  contract,
  caller: authority,
  editionRef: "item-1",
  title: "Night Drive",
  description: "A print",
  thumbnailUrl: "https://cdn.example/c.jpg",
  mediaUrl: "https://cdn.example/a.png",
  mediaType: "IMAGE",
  creator,
  royaltyBps: 500,
  supply: 100,
  prices: [{ paymentToken: tokenAddressOf(bandcoin, network.passphrase), price: 250_000_000n }],
});

const invocation = (xdr: string) => {
  const tx = TransactionBuilder.fromXDR(xdr, Networks.TESTNET) as Transaction;
  const op = tx.operations[0];
  if (op?.type !== "invokeHostFunction" || op.func.type !== "hostFunctionTypeInvokeContract")
    throw new Error("not a contract call");
  const call = op.func.invokeContract;
  return {
    tx,
    method: String(call.functionName),
    args: call.args.map((value) => scValToNative(value) as unknown),
  };
};

describe("buildNftRegisterEdition", () => {
  it("registers the edition with the artist paying the fee and the price authority authorising", () => {
    const built = buildNftRegisterEdition(base());
    const { tx, method, args } = invocation(built.xdr);
    expect(tx.source).toBe(artist);
    expect(method).toBe("register_edition");
    expect(built.serverSigners).toEqual([authority]);
    expect(args[0]).toBe(authority);
    expect(args[1]).toBe("item-1");
    expect(args[2]).toMatchObject({
      title: "Night Drive",
      description: "A print",
      thumbnail_url: "https://cdn.example/c.jpg",
      media_url: "https://cdn.example/a.png",
      media_type: "IMAGE",
      creator,
      royalty_bps: 500,
      supply: 100,
      prices: [
        { payment_token: tokenAddressOf(bandcoin, network.passphrase), price: 250_000_000n },
      ],
    });
  });

  it("refuses what the contract would refuse, before anyone is asked to sign", () => {
    expect(() => buildNftRegisterEdition({ ...base(), supply: 0 })).toThrow(
      "Supply must be from 1",
    );
    expect(() => buildNftRegisterEdition({ ...base(), supply: NFT_MAX_SUPPLY + 1 })).toThrow(
      "Supply must be from 1",
    );
    expect(() => buildNftRegisterEdition({ ...base(), prices: [] })).toThrow(
      "Add at least one price",
    );
    expect(() =>
      buildNftRegisterEdition({ ...base(), prices: [{ paymentToken: contract, price: 0n }] }),
    ).toThrow("Prices must be above zero");
    expect(() => buildNftRegisterEdition({ ...base(), royaltyBps: 9_001 })).toThrow(
      "Royalty can be at most 90%",
    );
    expect(() => buildNftRegisterEdition({ ...base(), title: "" })).toThrow("Give it a title");
    expect(() => buildNftRegisterEdition({ ...base(), title: "x".repeat(129) })).toThrow(
      "Title can be at most 128 characters",
    );
  });
});

describe("tokenAddressOf", () => {
  it("is the asset's Stellar Asset Contract address, the same on every call", () => {
    const address = tokenAddressOf(bandcoin, network.passphrase);
    expect(address).toMatch(/^C[A-Z2-7]{55}$/);
    expect(tokenAddressOf(new Asset("BANDCOIN", bandcoin.getIssuer()), network.passphrase)).toBe(
      address,
    );
    expect(tokenAddressOf(Asset.native(), network.passphrase)).not.toBe(address);
  });
});
