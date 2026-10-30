import {
  Account,
  Keypair,
  Networks,
  type Transaction,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { Db } from "@bandcoin/db";

import type { SessionUser } from "../context";
import type { ChainGateway } from "../services/chain-gateway";
import {
  quoteStorageOpening,
  startStorageOpening,
  submitStorageOpening,
} from "../services/artist/storage-account";

const wallet = Keypair.random();
const network = { passphrase: Networks.TESTNET, baseFee: "100" };
const ORDER = "cmvorder0000000000000011";
const me: SessionUser = {
  id: "me",
  role: "ARTIST",
  walletAddress: wallet.publicKey(),
  walletType: "freighter",
};
const approved = { id: "a1", status: "APPROVED", storageAccountId: null, fanTokenItemId: null };

beforeAll(() => {
  process.env.CHAIN_ACCOUNT_KEY = "ab".repeat(32);
});

type Row = Record<string, unknown>;

const fanToken = { code: "FYRON", issuer: Keypair.random().publicKey() };

function setup(opts: { xlm?: string } = {}) {
  const artists = new Map<string, Row>([["a1", { ...approved }]]);
  const chainAccounts = new Map<string, Row>();
  const orders = new Map<string, Row>();
  const db = {
    artist: {
      update: vi.fn(({ where, data }: { where: { id: string }; data: Row }) => {
        Object.assign(artists.get(where.id)!, data);
        return Promise.resolve(artists.get(where.id));
      }),
    },
    chainAccount: {
      findFirst: vi.fn(
        ({ where }: { where: { ownerId: string; kind: string; activatedAt: null | object } }) =>
          Promise.resolve(
            [...chainAccounts.values()].find(
              (row) =>
                row.ownerId === where.ownerId &&
                row.kind === where.kind &&
                (where.activatedAt === null ? row.activatedAt === null : row.activatedAt !== null),
            ) ?? null,
          ),
      ),
      findUnique: vi.fn(({ where }: { where: { publicKey: string } }) =>
        Promise.resolve(chainAccounts.get(where.publicKey) ?? null),
      ),
      create: vi.fn(({ data }: { data: Row }) => {
        const row = { id: `chain${chainAccounts.size + 1}`, activatedAt: null, ...data };
        chainAccounts.set(data.publicKey as string, row);
        return Promise.resolve(row);
      }),
      update: vi.fn(({ where, data }: { where: { id: string }; data: Row }) => {
        const row = [...chainAccounts.values()].find((entry) => entry.id === where.id)!;
        Object.assign(row, data);
        return Promise.resolve(row);
      }),
    },
    classicToken: {
      findUnique: vi.fn(({ where }: { where: { itemId: string } }) =>
        Promise.resolve(where.itemId === "fan" ? fanToken : null),
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
  const account = Object.assign(new Account(wallet.publicKey(), "5"), {
    subentry_count: 0,
    balances: [{ asset_type: "native", balance: opts.xlm ?? "10", selling_liabilities: "0" }],
  });
  const bandcoin = { code: "BANDCOIN", issuer: Keypair.random().publicKey() };
  const usdc = { code: "USDC", issuer: Keypair.random().publicKey() };
  const chain = {
    config: { name: "testnet", network, assets: { bandcoin, usdc } },
    loadAccount: vi.fn().mockResolvedValue(account),
    signWithServerKeys: vi.fn((xdr: string) => Promise.resolve(xdr)),
    submit: vi.fn(() => Promise.resolve({ hash: "txhash" })),
  };
  const activity = { set: vi.fn(), facts: () => ({}) };
  const ctx = { db: db as unknown as Db, chain: chain as unknown as ChainGateway, activity };
  return { ctx, chain, artists, chainAccounts, orders, bandcoin, usdc };
}

describe("opening the storage account", () => {
  it("prices 2.5 XLM and the fee for an approved artist", async () => {
    await expect(quoteStorageOpening(setup().ctx, me, approved)).resolves.toMatchObject({
      ok: true,
      total: "2.5000300",
    });
  });

  it("says why it can't open: already open, not approved yet, or not enough XLM", async () => {
    const { ctx } = setup();
    await expect(
      quoteStorageOpening(ctx, me, { ...approved, storageAccountId: "chain9" }),
    ).resolves.toMatchObject({
      ok: false,
      problems: [{ message: "Your storage account is already open." }],
    });
    await expect(
      quoteStorageOpening(ctx, me, { ...approved, status: "PENDING" }),
    ).resolves.toMatchObject({
      problems: [{ message: "You can open storage once your artist page is approved." }],
    });
    await expect(quoteStorageOpening(setup({ xlm: "2" }).ctx, me, approved)).resolves.toMatchObject(
      { problems: [{ code: "INSUFFICIENT_FUNDS" }] },
    );
    await expect(startStorageOpening(ctx, me, { ...approved, status: "PENDING" })).rejects.toThrow(
      /approved/,
    );
  });

  it("pays from the artist's wallet into a new storage account that trusts BANDCOIN and USDC", async () => {
    const { ctx, chainAccounts, orders, bandcoin, usdc } = setup();
    const started = await startStorageOpening(ctx, me, approved);
    expect(started).toMatchObject({ orderId: ORDER, signer: "wallet" });
    expect(orders.get(ORDER)).toMatchObject({
      kind: "STORAGE_SETUP",
      status: "AWAITING_SIGNATURE",
      total: "2.5000300",
    });

    const [storage] = [...chainAccounts.values()];
    expect(storage).toMatchObject({ kind: "STORAGE", ownerId: "me", activatedAt: null });
    const tx = TransactionBuilder.fromXDR(started.xdr, Networks.TESTNET) as Transaction;
    expect(tx.source).toBe(wallet.publicKey());
    expect(tx.operations).toMatchObject([
      { type: "createAccount", destination: storage!.publicKey, startingBalance: "2.5000000" },
      { type: "changeTrust", source: storage!.publicKey, line: { code: bandcoin.code } },
      { type: "changeTrust", source: storage!.publicKey, line: { code: usdc.code } },
    ]);
    expect(tx.signatures).toHaveLength(0);
  });

  it("links the account only after the payment lands, with storage co-signing", async () => {
    const { ctx, chain, artists, chainAccounts, orders } = setup();
    const started = await startStorageOpening(ctx, me, approved);
    const tx = TransactionBuilder.fromXDR(started.xdr, Networks.TESTNET) as Transaction;
    tx.sign(wallet);

    await submitStorageOpening(ctx, me, approved, { orderId: ORDER, xdr: tx.toXDR() });
    const [storage] = [...chainAccounts.values()];
    expect(chain.signWithServerKeys).toHaveBeenCalledWith(expect.any(String), [storage!.publicKey]);
    expect(storage!.activatedAt).toBeInstanceOf(Date);
    expect(artists.get("a1")?.storageAccountId).toBe(storage!.id);
    expect(orders.get(ORDER)?.status).toBe("DELIVERED");
  });

  it("leaves the artist unlinked when the network refuses the payment", async () => {
    const { ctx, chain, artists } = setup();
    chain.submit.mockRejectedValueOnce(new Error("tx_bad_seq"));
    const started = await startStorageOpening(ctx, me, approved);
    const tx = TransactionBuilder.fromXDR(started.xdr, Networks.TESTNET) as Transaction;
    tx.sign(wallet);
    await expect(
      submitStorageOpening(ctx, me, approved, { orderId: ORDER, xdr: tx.toXDR() }),
    ).rejects.toThrow();
    expect(artists.get("a1")?.storageAccountId).toBeNull();
  });

  it("also trusts the fan token when there is one, with its reserve in the price", async () => {
    const { ctx } = setup();
    const withToken = { ...approved, fanTokenItemId: "fan" };
    await expect(quoteStorageOpening(ctx, me, withToken)).resolves.toMatchObject({
      total: "3.0000400",
    });
    const started = await startStorageOpening(ctx, me, withToken);
    const tx = TransactionBuilder.fromXDR(started.xdr, Networks.TESTNET) as Transaction;
    expect(tx.operations).toHaveLength(4);
    expect(tx.operations[3]).toMatchObject({ type: "changeTrust", line: { code: "FYRON" } });
  });

  it("won't open a second storage account for the same person", async () => {
    const { ctx, chainAccounts } = setup();
    chainAccounts.set("GOLD", {
      id: "old",
      ownerId: "me",
      kind: "STORAGE",
      activatedAt: new Date(),
    });
    await expect(quoteStorageOpening(ctx, me, approved)).resolves.toMatchObject({
      ok: false,
      problems: [{ message: "Your storage account is already open." }],
    });
  });
});
