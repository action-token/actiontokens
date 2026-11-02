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
  quoteWithdraw,
  startWithdraw,
  storageContents,
  submitWithdraw,
} from "../services/artist/storage-withdraw";

const wallet = Keypair.random();
const storageKey = Keypair.random().publicKey();
const issuer = Keypair.random().publicKey();
const bandcoin = { code: "BANDCOIN", issuer: Keypair.random().publicKey() };
const usdc = { code: "USDC", issuer: Keypair.random().publicKey() };
const network = { passphrase: Networks.TESTNET, baseFee: "100" };
const ORDER = "cmvorder0000000000000031";
const me: SessionUser = {
  id: "me",
  role: "ARTIST",
  walletAddress: wallet.publicKey(),
  walletType: "freighter",
};
const artist = { storageAccountId: "st1" };
const song = { code: "SONG1", issuer };

beforeAll(() => {
  process.env.CHAIN_ACCOUNT_KEY = "ab".repeat(32);
});

type Row = Record<string, unknown>;
const credit = (asset: { code: string; issuer: string }, balance: string) => ({
  asset_type: "credit_alphanum12",
  asset_code: asset.code,
  asset_issuer: asset.issuer,
  balance,
  selling_liabilities: "0",
});

function setup(opts: { walletTrusts?: boolean } = {}) {
  const orders = new Map<string, Row>();
  const db = {
    chainAccount: {
      findUnique: vi.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(
          where.id === "st1" ? { publicKey: storageKey, activatedAt: new Date() } : null,
        ),
      ),
    },
    classicToken: {
      findMany: vi.fn(() =>
        Promise.resolve([{ ...song, item: { id: "song1", title: "First single" } }]),
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
    balances: [
      { asset_type: "native", balance: "10", selling_liabilities: "0" },
      ...(opts.walletTrusts ? [credit(song, "0")] : []),
    ],
  });
  // 3 trustlines: reserves are 2.5 XLM, so 1.5 of the 4 is spare
  const storage = Object.assign(new Account(storageKey, "1"), {
    subentry_count: 3,
    balances: [
      { asset_type: "native", balance: "4", selling_liabilities: "0" },
      credit(song, "7"),
      credit(bandcoin, "20"),
      credit(usdc, "0"),
    ],
  });
  const chain = {
    config: { name: "testnet", network, assets: { bandcoin, usdc } },
    loadAccount: vi.fn((id: string) => Promise.resolve(id === storageKey ? storage : mine)),
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

describe("what's in storage", () => {
  it("lists spare XLM, then payment assets, then copies with their titles", async () => {
    const contents = await storageContents(setup().ctx, artist);
    expect(contents?.holdings).toMatchObject([
      { code: "XLM", issuer: null, amount: "1.5000000", kind: "xlm" },
      { code: "BANDCOIN", amount: "20.0000000", title: null, kind: "bandcoin" },
      { code: "USDC", amount: "0.0000000", kind: "usdc" },
      { code: "SONG1", amount: "7.0000000", title: "First single", itemId: "song1", kind: "other" },
    ]);
    await expect(storageContents(setup().ctx, { storageAccountId: null })).resolves.toBeNull();
  });

  it("marks the artist's own fan token", async () => {
    const contents = await storageContents(setup().ctx, { ...artist, fanTokenItemId: "song1" });
    expect(contents?.holdings.find((holding) => holding.code === "SONG1")?.kind).toBe("fanToken");
  });
});

describe("taking things out of storage", () => {
  it("charges the fee, plus the wallet's own trustline reserve the first time", async () => {
    const first = await quoteWithdraw(setup().ctx, me, artist, { ...song, amount: "2" });
    expect(first).toMatchObject({ ok: true, total: "0.5000200" });
    expect(first.lines.map((line) => line.key)).toEqual(["reserve", "networkFee", "total"]);
    const again = await quoteWithdraw(setup({ walletTrusts: true }).ctx, me, artist, {
      ...song,
      amount: "2",
    });
    expect(again).toMatchObject({ ok: true, total: "0.0000100" });
  });

  it("never takes more than storage can spare, keeping its XLM reserves", async () => {
    const { ctx } = setup();
    await expect(quoteWithdraw(ctx, me, artist, { ...song, amount: "8" })).resolves.toMatchObject({
      ok: false,
      problems: [{ message: "Storage has only 7 SONG1 to take out." }],
    });
    await expect(
      quoteWithdraw(ctx, me, artist, { code: "XLM", issuer: null, amount: "2" }),
    ).resolves.toMatchObject({ problems: [{ message: "Storage has only 1.5 XLM to take out." }] });
    await expect(quoteWithdraw(ctx, me, artist, { ...song, amount: "-1" })).resolves.toMatchObject({
      problems: [{ message: "Enter an amount above zero." }],
    });
  });

  it("pays from storage into the artist's wallet, storage co-signing", async () => {
    const { ctx, chain, orders } = setup();
    const started = await startWithdraw(ctx, me, artist, { ...song, amount: "2" });
    expect(orders.get(ORDER)).toMatchObject({
      kind: "STORAGE_WITHDRAW",
      status: "AWAITING_SIGNATURE",
    });
    const tx = TransactionBuilder.fromXDR(started.xdr, Networks.TESTNET) as Transaction;
    expect(tx.source).toBe(wallet.publicKey());
    expect(tx.operations).toMatchObject([
      { type: "changeTrust", line: { code: "SONG1" } },
      { type: "payment", source: storageKey, destination: wallet.publicKey(), amount: "2.0000000" },
    ]);

    await submitWithdraw(ctx, me, artist, { orderId: ORDER, xdr: signed(started.xdr) });
    expect(chain.signWithServerKeys).toHaveBeenCalledWith(expect.any(String), [storageKey]);
    expect(orders.get(ORDER)?.status).toBe("DELIVERED");
  });

  it("leaves the order failed when the network refuses it", async () => {
    const { ctx, chain, orders } = setup();
    chain.submit.mockRejectedValueOnce(new Error("tx_bad_seq"));
    const started = await startWithdraw(ctx, me, artist, { ...song, amount: "1" });
    await expect(
      submitWithdraw(ctx, me, artist, { orderId: ORDER, xdr: signed(started.xdr) }),
    ).rejects.toThrow();
    expect(orders.get(ORDER)?.status).toBe("FAILED");
  });
});
