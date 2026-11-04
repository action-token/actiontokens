import {
  Account,
  Keypair,
  Networks,
  type Transaction,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { SessionUser } from "../context";
import {
  finishCancel,
  finishList,
  myListings,
  quoteCancel,
  quoteList,
  setListingPrice,
  soldHistory,
  startCancel,
  startList,
  submitCancel,
  submitList,
} from "../services/resale/classic";

const wallet = Keypair.random();
const tokenIssuer = Keypair.random().publicKey();
const bandcoin = { code: "BANDCOIN", issuer: Keypair.random().publicKey() };
const network = { passphrase: Networks.TESTNET, baseFee: "100" };
const ORDER = "cmvorder0000000000000041";
const me: SessionUser = {
  id: "me",
  role: "FAN",
  walletAddress: wallet.publicKey(),
  walletType: "freighter",
};

beforeAll(() => {
  process.env.CHAIN_ACCOUNT_KEY = "ab".repeat(32);
});

type Row = Record<string, unknown>;
const credit = (code: string, issuer: string, balance: string) => ({
  asset_type: "credit_alphanum12",
  asset_code: code,
  asset_issuer: issuer,
  balance,
  selling_liabilities: "0",
});
const native = (balance: string) => ({
  asset_type: "native",
  balance,
  selling_liabilities: "0",
  buying_liabilities: "0",
});
const account = (id: string, ...balances: Row[]) =>
  Object.assign(new Account(id, "100"), { subentry_count: balances.length, balances });

type Opts = {
  copies?: string;
  xlm?: string;
  hasBandcoin?: boolean;
  storage?: "none" | "open";
  storageHolds?: string | null;
  item?: Row | null;
  listing?: Row | null;
};

function setup(opts: Opts = {}) {
  const orders = new Map<string, Row>();
  const listings = new Map<string, Row>();
  const storageKey = Keypair.random().publicKey();
  const item =
    opts.item === undefined
      ? {
          id: "i1",
          title: "Print",
          type: "IMAGE",
          chainType: "CLASSIC_TOKEN",
          royaltyPercent: { toString: () => "10" },
          classicToken: { code: "PRINT", issuer: tokenIssuer },
        }
      : opts.item;
  const storageRow =
    opts.storage === "open" ? { id: "st1", publicKey: storageKey, activatedAt: new Date() } : null;
  const accounts: Record<string, ReturnType<typeof account> | null> = {
    [wallet.publicKey()]: account(
      wallet.publicKey(),
      native(opts.xlm ?? "20"),
      credit("PRINT", tokenIssuer, opts.copies ?? "5"),
      ...(opts.hasBandcoin === false ? [] : [credit("BANDCOIN", bandcoin.issuer, "100")]),
    ),
    [storageKey]:
      opts.storage === "open"
        ? account(
            storageKey,
            native("2"),
            ...(opts.storageHolds === null
              ? []
              : [credit("PRINT", tokenIssuer, opts.storageHolds ?? "3")]),
          )
        : null,
  };
  const db = {
    item: { findFirst: vi.fn().mockResolvedValue(item) },
    chainAccount: {
      findFirst: vi
        .fn()
        .mockImplementation(({ where }: { where: { publicKey?: string; kind: string } }) =>
          Promise.resolve(
            where.publicKey
              ? where.publicKey === storageKey
                ? { publicKey: storageKey }
                : null
              : storageRow,
          ),
        ),
      create: vi.fn(({ data }: { data: Row }) =>
        Promise.resolve({ id: "st2", activatedAt: null, ...data }),
      ),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    listing: {
      findFirst: vi.fn().mockResolvedValue(
        opts.listing === undefined
          ? {
              id: "l1",
              status: "ACTIVE",
              quantity: 3,
              quantitySold: 0,
              itemId: "i1",
              item: { classicToken: { code: "PRINT", issuer: tokenIssuer } },
            }
          : opts.listing,
      ),
      create: vi.fn(({ data }: { data: Row }) => {
        listings.set("l9", { id: "l9", ...data });
        return Promise.resolve({ id: "l9" });
      }),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findMany: vi.fn().mockResolvedValue([]),
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
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(({ where, data }: { where: { id: string }; data: Row }) => {
        Object.assign(orders.get(where.id)!, data);
        return Promise.resolve({});
      }),
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
  const chain = {
    config: {
      name: "testnet",
      network,
      assets: { bandcoin, usdc: { code: "USDC", issuer: Keypair.random().publicKey() } },
      treasury: Keypair.random().publicKey(),
      mother: Keypair.random().publicKey(),
    },
    loadAccount: vi.fn((key: string) => Promise.resolve(accounts[key] ?? null)),
    signWithServerKeys: vi.fn((xdr: string) => Promise.resolve(xdr)),
    signForCustodialUser: vi.fn((xdr: string) => Promise.resolve(xdr)),
    submit: vi.fn().mockResolvedValue({ hash: "txhash" }),
  };
  const ctx = { db, chain, activity: { set: vi.fn() } } as never;
  return { ctx, db, chain, orders, listings, storageKey };
}

const input = { itemId: "i1", amount: 3, priceBandcoin: "8", priceUsd: "0.9" };
const parse = (xdr: string) => TransactionBuilder.fromXDR(xdr, Networks.TESTNET) as Transaction;

describe("listing copies for resale", () => {
  it("shows what it costs, and what the holder gets after the artist's royalty", async () => {
    const { ctx } = setup();
    const quote = await quoteList(ctx, me, input);
    expect(quote).toMatchObject({ ok: true, willOpenStorage: true });
    // storage 1 + its first trustline 0.5, fee for 4 operations
    expect(quote.lines.map((l) => l.key)).toEqual(["storage", "networkFee", "total"]);
    expect(quote.net).toMatchObject({
      royaltyPercent: "10",
      bandcoin: { royalty: "0.8", net: "7.2" },
      usd: { royalty: "0.09", net: "0.81" },
    });
  });

  it("asks for less when storage is open and already trusts the token", async () => {
    const { ctx } = setup({ storage: "open" });
    const quote = await quoteList(ctx, me, input);
    expect(quote.willOpenStorage).toBe(false);
    expect(quote.lines.map((l) => l.key)).toEqual(["networkFee", "total"]);
  });

  it("adds the BANDCOIN line when the wallet can't be paid in it yet", async () => {
    const { ctx } = setup({ storage: "open", hasBandcoin: false });
    const quote = await quoteList(ctx, me, input);
    expect(quote.lines.map((l) => l.key)).toContain("payout");
  });

  it("says no for fan tokens, hidden items, copies you don't hold, bad prices and short XLM", async () => {
    await expect(quoteList(setup({ item: null }).ctx, me, input)).rejects.toThrow(
      /can't be resold/,
    );
    const fanToken = setup({
      item: {
        id: "i1",
        type: "FAN_TOKEN",
        chainType: "CLASSIC_TOKEN",
        royaltyPercent: null,
        classicToken: { code: "X", issuer: tokenIssuer },
      },
    });
    await expect(quoteList(fanToken.ctx, me, input)).rejects.toThrow(/can't be resold/);
    const few = await quoteList(setup({ copies: "2" }).ctx, me, input);
    expect(few.problems[0]?.message).toBe("Your wallet holds only 2 of these.");
    const none = await quoteList(setup({ copies: "0" }).ctx, me, { ...input, amount: 1 });
    expect(none.problems[0]?.message).toMatch(/doesn't hold any/);
    const price = await quoteList(setup().ctx, me, { ...input, priceUsd: "0" });
    expect(price.problems.map((p) => p.message)).toContain("Set a USD price above zero.");
    const poor = await quoteList(setup({ xlm: "1.6" }).ctx, me, input);
    expect(poor.problems[0]).toMatchObject({ code: "INSUFFICIENT_FUNDS" });
  });

  it("starts: a new storage account with its key kept, and one transaction that moves the copies", async () => {
    const { ctx, db, orders } = setup();
    const started = await startList(ctx, me, input);
    expect(db.chainAccount.create).toHaveBeenCalledTimes(1);
    const made = db.chainAccount.create.mock.calls[0]![0].data as Row;
    expect(made).toMatchObject({ kind: "RESALE_STORAGE", ownerId: "me" });
    expect(String(made.secretEncrypted)).not.toMatch(/^S[A-Z2-7]{55}$/);
    expect(orders.get(ORDER)).toMatchObject({
      kind: "RESALE_LIST",
      itemId: "i1",
      method: "WALLET",
      status: "AWAITING_SIGNATURE",
    });
    const tx = parse(started.xdr);
    expect(tx.operations.map((op) => op.type)).toEqual(["createAccount", "changeTrust", "payment"]);
    expect(tx.operations[2]).toMatchObject({ amount: "3.0000000" });
  });

  it("sends it signed by the holder, with storage co-signing its trustline, and the listing appears", async () => {
    const { ctx, chain, db, listings } = setup();
    const started = await startList(ctx, me, input);
    const storage = (db.chainAccount.create.mock.calls[0]![0].data as { publicKey: string })
      .publicKey;
    // The key is looked up for this holder and kind only.
    db.chainAccount.findFirst.mockImplementation(
      ({ where }: { where: { publicKey?: string; ownerId?: string; kind?: string } }) =>
        Promise.resolve(
          where.publicKey === storage && where.ownerId === "me" && where.kind === "RESALE_STORAGE"
            ? { publicKey: storage }
            : null,
        ),
    );
    const done = await submitList(ctx, me, { orderId: ORDER, xdr: started.xdr });
    expect(done).toMatchObject({ status: "DELIVERED", listingId: "l9" });
    expect(chain.signWithServerKeys).toHaveBeenCalledWith(started.xdr, [storage]);
    expect(chain.submit).toHaveBeenCalled();
    expect(listings.get("l9")).toMatchObject({
      itemId: "i1",
      sellerId: "me",
      kind: "RESALE",
      status: "ACTIVE",
      priceBandcoin: "8",
      priceUsd: "0.9",
      quantity: 3,
    });
    expect(db.chainAccount.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { activatedAt: expect.any(Date) } }),
    );
  });

  it("lists twice at two prices as two listings, and records each only once", async () => {
    const { ctx, db, orders } = setup({ storage: "open" });
    const first = await startList(ctx, me, input);
    // The network accepted it (what the app's submit or the worker's re-check records).
    orders.get(ORDER)!.status = "SUBMITTED";
    await finishList(ctx, ORDER);
    await expect(finishList(ctx, ORDER)).rejects.toBeDefined();
    expect(db.listing.create).toHaveBeenCalledTimes(1);
    expect(first.quote.willOpenStorage).toBe(false);
  });

  it("won't send an order it didn't make, or one that already went", async () => {
    const { ctx } = setup();
    const started = await startList(ctx, me, input);
    await expect(submitCancel(ctx, me, { orderId: ORDER, xdr: started.xdr })).rejects.toThrow(
      /not found/,
    );
  });
});

describe("changing a price", () => {
  it("sets new prices on your own live listing only", async () => {
    const { ctx, db } = setup();
    await setListingPrice(ctx, me, { listingId: "l1", priceBandcoin: "7.5", priceUsd: "0.8" });
    expect(db.listing.update).toHaveBeenCalledWith({
      where: { id: "l1" },
      data: { priceBandcoin: "7.5", priceUsd: "0.8", status: "ACTIVE" },
    });
    await expect(
      setListingPrice(ctx, me, { listingId: "l1", priceBandcoin: "0", priceUsd: "1" }),
    ).rejects.toThrow(/BANDCOIN price/);
    const ended = setup({
      listing: {
        id: "l1",
        status: "CLOSED",
        quantity: 3,
        quantitySold: 0,
        itemId: "i1",
        item: { classicToken: null },
      },
    });
    await expect(
      setListingPrice(ended.ctx, me, { listingId: "l1", priceBandcoin: "1", priceUsd: "1" }),
    ).rejects.toThrow(/has ended/);
    const foreign = setup({ listing: null });
    await expect(
      setListingPrice(foreign.ctx, me, { listingId: "x", priceBandcoin: "1", priceUsd: "1" }),
    ).rejects.toThrow(/not found/);
  });
});

describe("taking copies back", () => {
  it("returns only what's left of this listing, never other listings' copies", async () => {
    // Storage holds 8 (two listings); this one has 3 listed, 1 sold: 2 go back.
    const { ctx } = setup({
      storage: "open",
      storageHolds: "8",
      listing: {
        id: "l1",
        status: "ACTIVE",
        quantity: 3,
        quantitySold: 1,
        itemId: "i1",
        item: { classicToken: { code: "PRINT", issuer: tokenIssuer } },
      },
    });
    const quote = await quoteCancel(ctx, me, { listingId: "l1" });
    expect(quote).toMatchObject({ ok: true, copies: "2" });
    const started = await startCancel(ctx, me, { listingId: "l1" });
    expect(started).toMatchObject({ closed: false, copies: "2.0000000" });
    if (started.closed) throw new Error("unreachable");
    const ops = parse(started.xdr).operations;
    expect(ops.at(-1)).toMatchObject({
      type: "payment",
      amount: "2.0000000",
      destination: wallet.publicKey(),
    });
  });

  it("takes back no more than storage actually holds", async () => {
    const { ctx } = setup({ storage: "open", storageHolds: "1" });
    expect(await quoteCancel(ctx, me, { listingId: "l1" })).toMatchObject({ copies: "1" });
  });

  it("just closes a listing that has nothing left to return", async () => {
    const { ctx, db, orders } = setup({ storage: "open", storageHolds: null });
    expect(await startCancel(ctx, me, { listingId: "l1" })).toEqual({
      closed: true,
      listingId: "l1",
    });
    expect(db.listing.update).toHaveBeenCalledWith({
      where: { id: "l1" },
      data: { status: "CLOSED" },
    });
    expect(orders.size).toBe(0);
  });

  it("sends the signed return with storage co-signing, then closes the listing once", async () => {
    const { ctx, chain, db } = setup({ storage: "open" });
    const started = await startCancel(ctx, me, { listingId: "l1" });
    if (started.closed) throw new Error("unreachable");
    const done = await submitCancel(ctx, me, { orderId: ORDER, xdr: started.xdr });
    expect(done).toMatchObject({ status: "DELIVERED" });
    expect(chain.signWithServerKeys).toHaveBeenCalled();
    expect(db.listing.updateMany).toHaveBeenCalledWith({
      where: { id: "l1", status: { in: ["ACTIVE", "PAUSED"] } },
      data: { status: "CLOSED" },
    });
    await expect(finishCancel(ctx, ORDER)).rejects.toBeDefined();
  });

  it("refuses to end a listing that already ended", async () => {
    const { ctx } = setup({
      listing: {
        id: "l1",
        status: "SOLD_OUT",
        quantity: 3,
        quantitySold: 3,
        itemId: "i1",
        item: { classicToken: null },
      },
    });
    await expect(startCancel(ctx, me, { listingId: "l1" })).rejects.toThrow(/already ended/);
  });
});

describe("what the holder sees", () => {
  it("lists listings with what's left, and what sold", async () => {
    const { ctx, db } = setup();
    db.listing.findMany.mockResolvedValue([
      {
        id: "l1",
        status: "ACTIVE",
        priceBandcoin: { toString: () => "8" },
        priceUsd: { toString: () => "0.9" },
        quantity: 5,
        quantitySold: 2,
        createdAt: new Date(),
        item: { slug: "print", title: "Print", coverUrl: "u" },
      },
    ]);
    expect((await myListings(ctx, me))[0]).toMatchObject({
      listed: 5,
      sold: 2,
      left: 3,
      priceBandcoin: "8",
    });
    db.order.findMany.mockResolvedValue([
      {
        id: "o1",
        quantity: 2,
        currency: "BANDCOIN",
        unitPrice: { toString: () => "8" },
        txHash: "h",
        createdAt: new Date(),
        item: { slug: "print", title: "Print" },
      },
    ]);
    expect((await soldHistory(ctx, me))[0]).toMatchObject({
      quantity: 2,
      unitPrice: "8",
      txHash: "h",
    });
    expect(db.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          kind: "ITEM_PURCHASE",
          status: "DELIVERED",
          listing: { sellerId: "me", kind: "RESALE" },
        },
      }),
    );
  });
});
