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
  endStaleNftListings,
  finishCancelNft,
  finishListNft,
  nftNet,
  quoteCancelNft,
  quoteListNft,
  startCancelNft,
  startListNft,
  submitCancelNft,
  submitListNft,
} from "../services/resale/nft";

const wallet = Keypair.random();
const artistWallet = Keypair.random().publicKey();
const bandcoin = { code: "BANDCOIN", issuer: Keypair.random().publicKey() };
const network = { passphrase: Networks.TESTNET, baseFee: "100" };
const CONTRACT = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";
const ORDER = "cmvorder0000000000000051";
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
const account = (id: string, xlm: string) =>
  Object.assign(new Account(id, "100"), {
    subentry_count: 0,
    balances: [
      { asset_type: "native", balance: xlm, selling_liabilities: "0", buying_liabilities: "0" },
    ],
  });

function setup(
  opts: { xlm?: string; editions?: Row[]; item?: Row | null; listing?: Row | null } = {},
) {
  const orders = new Map<string, Row>();
  const upserts: Row[] = [];
  const item =
    opts.item === undefined
      ? {
          id: "i1",
          title: "Pass",
          organization: { user: { walletAddress: artistWallet } },
          contractNft: { royaltyBps: 1000, status: "MINTED" },
        }
      : opts.item;
  const db = {
    item: { findFirst: vi.fn().mockResolvedValue(item) },
    appSetting: { findUnique: vi.fn().mockResolvedValue({ platformFeeBps: 250 }) },
    nftEdition: {
      findMany: vi.fn().mockResolvedValue(
        opts.editions ?? [
          { id: "e7", tokenId: "7" },
          { id: "e8", tokenId: "8" },
          { id: "e9", tokenId: "9" },
        ],
      ),
    },
    listing: {
      findFirst: vi.fn().mockResolvedValue(
        opts.listing === undefined
          ? {
              id: "l1",
              status: "ACTIVE",
              itemId: "i1",
              edition: { id: "e7", tokenId: "7", ownerId: "me" },
            }
          : opts.listing,
      ),
      upsert: vi.fn((args: Row) => {
        upserts.push(args);
        return Promise.resolve({ id: `l-${(args.where as { editionId: string }).editionId}` });
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
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
      nftContract: CONTRACT,
      assets: { bandcoin, usdc: { code: "USDC", issuer: Keypair.random().publicKey() } },
      treasury: Keypair.random().publicKey(),
    },
    loadAccount: vi.fn(() => Promise.resolve(account(wallet.publicKey(), opts.xlm ?? "20"))),
    nftFeeSettings: vi.fn().mockResolvedValue({ feeBps: 250, treasury: null, owner: null }),
    prepareContractCall: vi.fn((xdr: string) => Promise.resolve(xdr)),
    signForCustodialUser: vi.fn((xdr: string) => Promise.resolve(xdr)),
    submit: vi.fn().mockResolvedValue({ hash: "txhash" }),
  };
  const ctx = { db, chain, activity: { set: vi.fn() } } as never;
  return { ctx, db, chain, orders, upserts };
}

const input = { itemId: "i1", amount: 2, priceBandcoin: "100", priceUsd: "9" };
const call = (xdr: string) => {
  const tx = TransactionBuilder.fromXDR(xdr, Networks.TESTNET) as Transaction;
  const op = tx.operations[0] as unknown as {
    type: string;
    func: { value: { functionName: Uint8Array } };
  };
  return { type: op.type, method: String(op.func.value.functionName) };
};

describe("what a seller gets for a smart-contract NFT", () => {
  it("takes the platform fee and the royalty out of the price, as the contract does", () => {
    // 2.5% fee, 10% royalty on 100: 2.5 and 10 go, the seller gets 87.5.
    expect(nftNet("100", 250, 1000)).toEqual({
      platform: "2.5",
      royalty: "10",
      net: "87.5",
    });
  });
});

describe("listing smart-contract NFTs", () => {
  it("quotes the lowest-numbered free copies, the network fee and the net per copy", async () => {
    const { ctx, db } = setup();
    const quote = await quoteListNft(ctx, me, input);
    expect(quote.ok).toBe(true);
    expect(quote.copies).toEqual(["7", "8"]);
    expect(quote.net.bandcoin.net).toBe("87.5");
    expect(quote.net.usd).toBeNull();
    expect(quote.total).toBe("0.3100000");
    // Only copies the seller owns, with no live listing.
    expect(db.nftEdition.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ itemId: "i1", ownerId: "me" }),
        orderBy: { tokenId: "asc" },
      }),
    );
  });

  it("charges no royalty when the seller is the artist", async () => {
    const { ctx, chain } = setup();
    chain.loadAccount.mockResolvedValue(account(artistWallet, "20") as never);
    const quote = await quoteListNft(ctx, { ...me, walletAddress: artistWallet }, input);
    expect(quote.net.royaltyPercent).toBe("0");
    expect(quote.net.bandcoin.net).toBe("97.5");
  });

  it("says so when there is no free copy, or too little XLM", async () => {
    const none = setup({ editions: [] });
    expect((await quoteListNft(none.ctx, me, input)).problems[0]!.message).toMatch(/free copy/);
    const poor = setup({ xlm: "0.2" });
    expect((await quoteListNft(poor.ctx, me, input)).problems[0]!.code).toBe("INSUFFICIENT_FUNDS");
  });

  it("refuses a price of zero and an item that isn't a smart-contract NFT", async () => {
    const { ctx } = setup();
    expect((await quoteListNft(ctx, me, { ...input, priceBandcoin: "0" })).ok).toBe(false);
    const other = setup({ item: null });
    await expect(quoteListNft(other.ctx, me, input)).rejects.toThrow(/can't be resold/);
  });

  it("builds one list_batch call for the holder to sign, and nothing is recorded yet", async () => {
    const { ctx, db, chain } = setup();
    const started = await startListNft(ctx, me, input);
    expect(call(started.xdr)).toEqual({ type: "invokeHostFunction", method: "list_batch" });
    expect(chain.prepareContractCall).toHaveBeenCalled();
    expect(started.signer).toBe("wallet");
    expect(db.listing.upsert).not.toHaveBeenCalled();
    expect(db.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ kind: "RESALE_LIST", quantity: 2, currency: "XLM" }),
      }),
    );
  });

  it("uses a plain list call for one copy", async () => {
    const { ctx } = setup();
    const started = await startListNft(ctx, me, { ...input, amount: 1 });
    expect(call(started.xdr).method).toBe("list");
  });

  it("records one listing per copy once the network has it, reusing an ended row", async () => {
    const { ctx, chain, upserts } = setup();
    const started = await startListNft(ctx, me, input);
    const done = await submitListNft(ctx, me, { orderId: ORDER, xdr: started.xdr });
    expect(chain.submit).toHaveBeenCalled();
    expect(done.status).toBe("DELIVERED");
    expect(upserts).toHaveLength(2);
    expect(upserts[0]).toMatchObject({
      where: { editionId: "e7" },
      create: {
        editionId: "e7",
        itemId: "i1",
        sellerId: "me",
        kind: "RESALE",
        status: "ACTIVE",
        priceBandcoin: "100",
        priceUsd: "9",
        quantity: 1,
      },
      update: { status: "ACTIVE", quantitySold: 0 },
    });
  });

  it("puts a new price on listed copies with the same call, not a cancel", async () => {
    const { ctx, db } = setup({ editions: [{ id: "e7", tokenId: "7" }] });
    const started = await startListNft(ctx, me, { ...input, amount: 1, listingIds: ["l1"] });
    expect(call(started.xdr).method).toBe("list");
    expect(db.nftEdition.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          listing: { id: { in: ["l1"] }, kind: "RESALE", status: "ACTIVE" },
        }),
      }),
    );
  });

  it("won't send a transaction that isn't the one built for the order", async () => {
    const { ctx, chain } = setup();
    await startListNft(ctx, me, input);
    const other = (await startListNft(setup().ctx, me, { ...input, amount: 1 })).xdr;
    await expect(submitListNft(ctx, me, { orderId: ORDER, xdr: other })).rejects.toThrow(
      /doesn't belong/,
    );
    expect(chain.submit).not.toHaveBeenCalled();
  });

  it("stops before anything is sent if the real fee is above the estimate", async () => {
    const { ctx, chain } = setup();
    chain.prepareContractCall.mockImplementation(async (xdr: string) => {
      const tx = TransactionBuilder.fromXDR(xdr, Networks.TESTNET) as Transaction;
      return TransactionBuilder.cloneFrom(tx, {
        fee: "900000000",
        networkPassphrase: Networks.TESTNET,
      })
        .build()
        .toXDR();
    });
    await expect(startListNft(ctx, me, input)).rejects.toThrow(/network fee is higher/);
  });
});

describe("taking a smart-contract NFT off sale", () => {
  it("builds a cancel_listing call and ends the listing once it is on the network", async () => {
    const { ctx, db, chain } = setup();
    expect((await quoteCancelNft(ctx, me, { listingId: "l1" })).ok).toBe(true);
    const started = await startCancelNft(ctx, me, { listingId: "l1" });
    expect(call(started.xdr).method).toBe("cancel_listing");
    expect(db.listing.updateMany).not.toHaveBeenCalled();
    const done = await submitCancelNft(ctx, me, { orderId: ORDER, xdr: started.xdr });
    expect(chain.submit).toHaveBeenCalled();
    expect(done.status).toBe("DELIVERED");
    expect(db.listing.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "CLOSED" } }),
    );
  });

  it("only your own, still-live listings", async () => {
    const gone = setup({ listing: null });
    await expect(startCancelNft(gone.ctx, me, { listingId: "x" })).rejects.toThrow(/not found/i);
    const ended = setup({
      listing: { id: "l1", status: "CLOSED", itemId: "i1", edition: { id: "e7", tokenId: "7" } },
    });
    await expect(startCancelNft(ended.ctx, me, { listingId: "l1" })).rejects.toThrow(/ended/);
  });

  it("finishing twice is harmless", async () => {
    const { ctx } = setup();
    const started = await startCancelNft(ctx, me, { listingId: "l1" });
    await submitCancelNft(ctx, me, { orderId: ORDER, xdr: started.xdr });
    await expect(finishCancelNft(ctx, ORDER)).rejects.toThrow();
    await expect(finishListNft(ctx, ORDER)).rejects.toThrow();
  });
});

describe("listings whose copy moved", () => {
  const row = (id: string, tokenId: string, wallet: string) => ({
    id,
    seller: { walletAddress: wallet },
    edition: { tokenId },
  });

  it("ends a listing when the contract says someone else owns the copy", async () => {
    const { ctx, db, chain } = setup();
    db.listing.findMany.mockResolvedValue([
      row("l1", "7", wallet.publicKey()),
      row("l2", "8", wallet.publicKey()),
    ]);
    (chain as Record<string, unknown>).nftOwnerOf = vi.fn((token: number) =>
      Promise.resolve(token === 7 ? wallet.publicKey() : Keypair.random().publicKey()),
    );
    expect(await endStaleNftListings(ctx)).toEqual({ checked: 2, ended: 1 });
    expect(db.listing.updateMany).toHaveBeenCalledTimes(1);
    expect(db.listing.updateMany).toHaveBeenCalledWith({
      where: { id: "l2", status: "ACTIVE" },
      data: { status: "CLOSED" },
    });
  });

  it("leaves a listing alone when the owner can't be read", async () => {
    const { ctx, db, chain } = setup();
    db.listing.findMany.mockResolvedValue([row("l1", "7", wallet.publicKey())]);
    (chain as Record<string, unknown>).nftOwnerOf = vi.fn().mockResolvedValue(null);
    expect(await endStaleNftListings(ctx)).toEqual({ checked: 1, ended: 0 });
    expect(db.listing.updateMany).not.toHaveBeenCalled();
  });
});
