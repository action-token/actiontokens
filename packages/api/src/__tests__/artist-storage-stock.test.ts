import {
  Account,
  Keypair,
  Networks,
  type Transaction,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { Db } from "@actiontokens/db";

import type { SessionUser } from "../context";
import type { ChainGateway } from "../services/chain-gateway";
import { quoteStock, startStock, submitStock } from "../services/artist/storage-stock";

const wallet = Keypair.random();
const issuer = Keypair.random().publicKey();
const storageKey = Keypair.random().publicKey();
const network = { passphrase: Networks.TESTNET, baseFee: "100" };
const ORDER = "cmvorder0000000000000021";
const me: SessionUser = {
  id: "me",
  role: "ARTIST",
  walletAddress: wallet.publicKey(),
  walletType: "freighter",
};
const artist = { id: "a1", storageAccountId: "st1", issuerAccountId: "is1" };

beforeAll(() => {
  process.env.CHAIN_ACCOUNT_KEY = "ab".repeat(32);
});

type Row = Record<string, unknown>;

function setup(
  opts: { supply?: number | null; holders?: string[]; inStorage?: string; complete?: boolean } = {},
) {
  const orders = new Map<string, Row>();
  const item = {
    id: "song1",
    supply: opts.supply === undefined ? 100 : opts.supply,
    classicToken: { code: "SONG1", issuer, isExternal: false, issuerAccount: null },
    organization: { issuerAccount: { publicKey: issuer, activatedAt: new Date() } },
  };
  const db = {
    item: {
      findFirst: vi.fn(({ where }: { where: { id: string; organizationId: string } }) =>
        Promise.resolve(where.id === item.id && where.organizationId === "a1" ? item : null),
      ),
    },
    chainAccount: {
      findUnique: vi.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(
          where.id === "st1" ? { publicKey: storageKey, activatedAt: new Date() } : null,
        ),
      ),
    },
    order: {
      create: vi.fn(({ data }: { data: Row }) => {
        const row = { id: ORDER, status: "QUOTED", buyerId: "me", ...data };
        orders.set(ORDER, row);
        return Promise.resolve(row);
      }),
      findUnique: vi.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(orders.get(where.id) ?? null),
      ),
      findUniqueOrThrow: vi.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(orders.get(where.id)),
      ),
      updateMany: vi.fn(
        ({ where, data }: { where: { id: string; status: { in: string[] } }; data: Row }) => {
          const row = orders.get(where.id);
          if (!row || !where.status.in.includes(row.status as string))
            return Promise.resolve({ count: 0 });
          Object.assign(row, data);
          return Promise.resolve({ count: 1 });
        },
      ),
    },
    $transaction: (run: (tx: unknown) => unknown) => run(db),
  };
  const mine = Object.assign(new Account(wallet.publicKey(), "5"), {
    subentry_count: 0,
    balances: [{ asset_type: "native", balance: "10", selling_liabilities: "0" }],
  });
  const storage = Object.assign(new Account(storageKey, "1"), {
    balances:
      opts.inStorage === undefined
        ? [{ asset_type: "native", balance: "2.5" }]
        : [
            { asset_type: "native", balance: "2.5" },
            {
              asset_type: "credit_alphanum12",
              asset_code: "SONG1",
              asset_issuer: issuer,
              balance: opts.inStorage,
            },
          ],
  });
  const chain = {
    config: {
      name: "testnet",
      network,
      assets: {
        actionToken: { code: "ACTION", issuer: Keypair.random().publicKey() },
        usdc: { code: "USDC", issuer: Keypair.random().publicKey() },
      },
    },
    loadAccount: vi.fn((id: string) => Promise.resolve(id === storageKey ? storage : mine)),
    assetHolders: vi.fn(() =>
      Promise.resolve({
        holders: (opts.holders ?? []).map((balance, index) => ({
          address: `G${index}`,
          balance,
        })),
        complete: opts.complete ?? true,
      }),
    ),
    signWithServerKeys: vi.fn((xdr: string) => Promise.resolve(xdr)),
    submit: vi.fn(() => Promise.resolve({ hash: "txhash" })),
  };
  const activity = { set: vi.fn(), facts: () => ({}) };
  const ctx = { db: db as unknown as Db, chain: chain as unknown as ChainGateway, activity };
  return { ctx, chain, orders };
}

const signed = (xdr: string) => {
  const tx = TransactionBuilder.fromXDR(xdr, Networks.TESTNET) as Transaction;
  tx.sign(wallet);
  return tx.toXDR();
};

describe("adding copies to storage", () => {
  it("charges the trustline reserve and fee the first time storage holds the token", async () => {
    const quote = await quoteStock(setup().ctx, me, artist, { itemId: "song1", quantity: 10 });
    expect(quote).toMatchObject({
      ok: true,
      total: "0.5000300",
      stock: { code: "SONG1", inStorage: "0", mintable: "100" },
    });
    expect(quote.lines.map((line) => line.key)).toEqual(["reserve", "networkFee", "total"]);
  });

  it("charges only the fee once storage already holds it", async () => {
    const quote = await quoteStock(setup({ inStorage: "4" }).ctx, me, artist, {
      itemId: "song1",
      quantity: 1,
    });
    expect(quote).toMatchObject({ ok: true, total: "0.0000100", stock: { inStorage: "4" } });
  });

  it("never makes more copies than the supply, counting what's already out", async () => {
    const { ctx } = setup({ supply: 10, holders: ["6", "3"] });
    await expect(
      quoteStock(ctx, me, artist, { itemId: "song1", quantity: 2 }),
    ).resolves.toMatchObject({
      ok: false,
      problems: [{ message: "Only 1 more copy can be made (supply 10)." }],
    });
    await expect(startStock(ctx, me, artist, { itemId: "song1", quantity: 2 })).rejects.toThrow(
      /Only 1/,
    );
    const unlimited = setup({ supply: null, holders: ["999"] });
    await expect(
      quoteStock(unlimited.ctx, me, artist, { itemId: "song1", quantity: 5000 }),
    ).resolves.toMatchObject({ ok: true, stock: { mintable: null } });
  });

  it("needs an open storage account and the artist's own item", async () => {
    const { ctx } = setup();
    await expect(
      quoteStock(ctx, me, { ...artist, storageAccountId: null }, { itemId: "song1", quantity: 1 }),
    ).resolves.toMatchObject({
      problems: [{ message: "Open your storage account first (Settings › Accounts)." }],
    });
    await expect(quoteStock(ctx, me, artist, { itemId: "other", quantity: 1 })).rejects.toThrow(
      /not found/,
    );
  });

  it("mints from the issuer into storage, storage co-signing only for its new trustline", async () => {
    const first = setup();
    const started = await startStock(first.ctx, me, artist, { itemId: "song1", quantity: 3 });
    expect(first.orders.get(ORDER)).toMatchObject({
      kind: "STORAGE_STOCK",
      status: "AWAITING_SIGNATURE",
      quantity: 3,
    });
    const tx = TransactionBuilder.fromXDR(started.xdr, Networks.TESTNET) as Transaction;
    expect(tx.source).toBe(wallet.publicKey());
    expect(tx.operations).toMatchObject([
      { type: "payment", destination: storageKey, amount: "0.5000000" },
      { type: "changeTrust", source: storageKey },
      { type: "payment", source: issuer, destination: storageKey, amount: "3.0000000" },
    ]);
    await submitStock(first.ctx, me, artist, { orderId: ORDER, xdr: signed(started.xdr) });
    expect(first.chain.signWithServerKeys).toHaveBeenCalledWith(expect.any(String), [
      issuer,
      storageKey,
    ]);
    expect(first.orders.get(ORDER)?.status).toBe("DELIVERED");

    const again = setup({ inStorage: "3" });
    const more = await startStock(again.ctx, me, artist, { itemId: "song1", quantity: 1 });
    await submitStock(again.ctx, me, artist, { orderId: ORDER, xdr: signed(more.xdr) });
    expect(again.chain.signWithServerKeys).toHaveBeenCalledWith(expect.any(String), [issuer]);
  });

  it("leaves the order failed when the network refuses it", async () => {
    const { ctx, chain, orders } = setup();
    chain.submit.mockRejectedValueOnce(new Error("tx_bad_seq"));
    const started = await startStock(ctx, me, artist, { itemId: "song1", quantity: 1 });
    await expect(
      submitStock(ctx, me, artist, { orderId: ORDER, xdr: signed(started.xdr) }),
    ).rejects.toThrow();
    expect(orders.get(ORDER)?.status).toBe("FAILED");
  });
});
