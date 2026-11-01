import {
  Account,
  Keypair,
  Networks,
  scValToNative,
  type Transaction,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";

import { buildNftTransfer } from "../nft/calls";

const network = { passphrase: Networks.TESTNET, baseFee: "100" };
const contract = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
const owner = Keypair.random().publicKey();
const fan = Keypair.random().publicKey();

describe("buildNftTransfer", () => {
  it("has the owner give one copy, paying the fee, with nothing for the server to sign", () => {
    const built = buildNftTransfer({
      source: new Account(owner, "7"),
      network,
      contract,
      to: fan,
      tokenId: 12,
    });
    const tx = TransactionBuilder.fromXDR(built.xdr, Networks.TESTNET) as Transaction;
    const op = tx.operations[0];
    if (op?.type !== "invokeHostFunction" || op.func.type !== "hostFunctionTypeInvokeContract")
      throw new Error("not a contract call");
    const call = op.func.invokeContract;
    expect(tx.source).toBe(owner);
    expect(String(call.functionName)).toBe("transfer");
    expect(call.args.map((value) => scValToNative(value) as unknown)).toEqual([owner, fan, 12]);
    expect(built.serverSigners).toEqual([]);
  });

  it("refuses a gift to the owner", () => {
    expect(() =>
      buildNftTransfer({
        source: new Account(owner, "7"),
        network,
        contract,
        to: owner,
        tokenId: 1,
      }),
    ).toThrow(/already own/);
  });
});
