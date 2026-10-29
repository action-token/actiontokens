import {
  Account,
  Asset,
  Keypair,
  Networks,
  Operation,
  type Transaction,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { Db } from "@bandcoin/db";

import { createChainGateway } from "../services/chain-gateway";

const mother = Keypair.random();
const treasury = Keypair.random();
const stranger = Keypair.random();

beforeAll(() => {
  Object.assign(process.env, {
    NEXT_PUBLIC_STELLAR_NETWORK: "testnet",
    NEXT_PUBLIC_ASSET_CODE: "BANDCOIN",
    NEXT_PUBLIC_ASSET_ISSUER: Keypair.random().publicKey(),
    PLATFORM_TREASURY: treasury.publicKey(),
    MOTHER_SECRET: mother.secret(),
    TREASURY_SECRET: treasury.secret(),
  });
});

function unsigned() {
  return new TransactionBuilder(new Account(Keypair.random().publicKey(), "1"), {
    fee: "100",
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.payment({
        source: mother.publicKey(),
        destination: stranger.publicKey(),
        asset: Asset.native(),
        amount: "1",
      }),
    )
    .setTimeout(60)
    .build()
    .toXDR();
}

describe("signWithServerKeys", () => {
  it("signs with the mother key from env without a database lookup", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const gateway = createChainGateway({ chainAccount: { findMany } } as unknown as Db);
    const signed = TransactionBuilder.fromXDR(
      await gateway.signWithServerKeys(unsigned(), [mother.publicKey()]),
      Networks.TESTNET,
    ) as Transaction;
    expect(signed.signatures).toHaveLength(1);
    expect(mother.verify(signed.hash(), signed.signatures[0]!.signature)).toBe(true);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("signs for the treasury (the NFT contract's price authority) from env too", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const gateway = createChainGateway({ chainAccount: { findMany } } as unknown as Db);
    const signed = TransactionBuilder.fromXDR(
      await gateway.signWithServerKeys(unsigned(), [treasury.publicKey(), mother.publicKey()]),
      Networks.TESTNET,
    ) as Transaction;
    expect(signed.signatures).toHaveLength(2);
    const signedBy = (key: Keypair) =>
      signed.signatures.some((entry) => key.verify(signed.hash(), entry.signature));
    expect([signedBy(treasury), signedBy(mother)]).toEqual([true, true]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("won't use a TREASURY_SECRET that belongs to a different account than PLATFORM_TREASURY", async () => {
    const saved = process.env.TREASURY_SECRET;
    process.env.TREASURY_SECRET = stranger.secret();
    try {
      const gateway = createChainGateway({
        chainAccount: { findMany: vi.fn().mockResolvedValue([]) },
      } as unknown as Db);
      await expect(
        gateway.signWithServerKeys(unsigned(), [treasury.publicKey()]),
      ).rejects.toMatchObject({ details: { missing: [treasury.publicKey()] } });
    } finally {
      process.env.TREASURY_SECRET = saved;
    }
  });

  it("still refuses a key it doesn't hold", async () => {
    const gateway = createChainGateway({
      chainAccount: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as Db);
    await expect(
      gateway.signWithServerKeys(unsigned(), [mother.publicKey(), stranger.publicKey()]),
    ).rejects.toMatchObject({
      details: { missing: [stranger.publicKey()] },
    });
  });
});
