import { Account, Asset, Keypair, Networks, Operation, type Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { Db } from "@bandcoin/db";

import { createChainGateway } from "../services/chain-gateway";

const mother = Keypair.random();
const stranger = Keypair.random();

beforeAll(() => {
  Object.assign(process.env, {
    NEXT_PUBLIC_STELLAR_NETWORK: "testnet",
    NEXT_PUBLIC_ASSET_CODE: "BANDCOIN",
    NEXT_PUBLIC_ASSET_ISSUER: Keypair.random().publicKey(),
    PLATFORM_TREASURY: Keypair.random().publicKey(),
    MOTHER_SECRET: mother.secret(),
  });
});

function unsigned() {
  return new TransactionBuilder(new Account(Keypair.random().publicKey(), "1"), { fee: "100", networkPassphrase: Networks.TESTNET })
    .addOperation(Operation.payment({ source: mother.publicKey(), destination: stranger.publicKey(), asset: Asset.native(), amount: "1" }))
    .setTimeout(60)
    .build()
    .toXDR();
}

describe("signWithServerKeys", () => {
  it("signs with the mother key from env without a database lookup", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const gateway = createChainGateway({ chainAccount: { findMany } } as unknown as Db);
    const signed = TransactionBuilder.fromXDR(await gateway.signWithServerKeys(unsigned(), [mother.publicKey()]), Networks.TESTNET) as Transaction;
    expect(signed.signatures).toHaveLength(1);
    expect(mother.verify(signed.hash(), signed.signatures[0]!.signature)).toBe(true);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("still refuses a key it doesn't hold", async () => {
    const gateway = createChainGateway({ chainAccount: { findMany: vi.fn().mockResolvedValue([]) } } as unknown as Db);
    await expect(gateway.signWithServerKeys(unsigned(), [mother.publicKey(), stranger.publicKey()])).rejects.toMatchObject({
      details: { missing: [stranger.publicKey()] },
    });
  });
});
