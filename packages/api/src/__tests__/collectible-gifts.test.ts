import {
  Account,
  Keypair,
  Networks,
  scValToNative,
  type Transaction,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { describe, expect, it, vi } from "vitest";

import type { Db } from "@bandcoin/db";
import { AppError, ErrorCodes } from "@bandcoin/errors";

import type { SessionUser } from "../context";
import type { ChainGateway } from "../services/chain-gateway";
import {
  giftableCopies,
  quoteCollectibleGift,
  startCollectibleGift,
  submitCollectibleGift,
} from "../services/artist/collectible-gifts";

const wallet = Keypair.random();
const fanWallet = Keypair.random().publicKey();
const newWallet = Keypair.random().publicKey();
const network = { passphrase: Networks.TESTNET, baseFee: "100" };
const contract = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
const ORDER = "cmvorder0000000000000042";
const me: SessionUser = {
  id: "u-artist",
  role: "ARTIST",
  walletAddress: wallet.publicKey(),
  walletType: "freighter",
};
const fan = {
  id: "u-fan",
  username: "ana",
  displayName: "Ana B",
  avatarUrl: null,
  walletAddress: fanWallet,
};

type Row = Record<string, unknown>;

function setup(
  opts: {
    xlm?: string;
    edition?: Row | null;
    fan?: Row | null;
    feeStroops?: number;
    submit?: () => Promise<{ hash: string }>;
    senderQuantity?: number;
  } = {},
) {
  const orders = new Map<string, Row>();
  const edition =
    opts.edition === undefined
      ? {
          id: "ed1",
          tokenId: "12",
          ownerId: "u-artist",
          itemId: "item1",
          item: { title: "Night Drive", chainType: "CONTRACT_NFT", deletedAt: null },
          listing: null,
        }
      : opts.edition;
  const db = {
    nftEdition: {
      findUnique: vi.fn().mockResolvedValue(edition),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
    },
    user: { findFirst: vi.fn().mockResolvedValue(opts.fan === undefined ? fan : opts.fan) },
    ownership: {
      findUnique: vi.fn().mockResolvedValue({
        quantity: { lte: (n: number) => (opts.senderQuantity ?? 1) <= n },
      }),
      delete: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      upsert: vi.fn().mockResolvedValue({}),
    },
    pin: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
    order: {
      create: vi.fn(({ data }: { data: Row }) => {
        const row = { id: ORDER, status: "QUOTED", buyerId: "u-artist", ...data };
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
  const artistAccount = Object.assign(new Account(wallet.publicKey(), "5"), {
    subentry_count: 0,
    balances: [{ asset_type: "native", balance: opts.xlm ?? "10", selling_liabilities: "0" }],
  });
  const chain = {
    config: {
      name: "testnet",
      network,
      assets: {
        bandcoin: { code: "BANDCOIN", issuer: Keypair.random().publicKey() },
        usdc: { code: "USDC", issuer: Keypair.random().publicKey() },
      },
      treasury: Keypair.random().publicKey(),
      mother: null,
      nftContract: contract,
    },
    loadAccount: vi.fn((id: string) =>
      Promise.resolve(id === wallet.publicKey() ? artistAccount : null),
    ),
    // Simulation sets the real fee; here it only changes the fee when asked.
    prepareContractCall: vi.fn((xdr: string) => {
      if (opts.feeStroops === undefined) return Promise.resolve(xdr);
      const tx = TransactionBuilder.fromXDR(xdr, network.passphrase) as Transaction;
      const rebuilt = TransactionBuilder.cloneFrom(tx, {
        fee: String(opts.feeStroops),
        networkPassphrase: network.passphrase,
      }).build();
      return Promise.resolve(rebuilt.toXDR());
    }),
    accountForEmail: vi.fn().mockResolvedValue({
      userId: "u-new",
      walletAddress: newWallet,
      custodial: true,
      created: true,
    }),
    submit: vi.fn(opts.submit ?? (() => Promise.resolve({ hash: "txhash" }))),
    sendEmail: vi.fn().mockResolvedValue(true),
  };
  const activity = { set: vi.fn(), facts: () => ({}) };
  return {
    ctx: { db: db as unknown as Db, chain: chain as unknown as ChainGateway, activity },
    db,
    chain,
    orders,
  };
}

const transferArgs = (xdr: string) => {
  const tx = TransactionBuilder.fromXDR(xdr, network.passphrase) as Transaction;
  const op = tx.operations[0];
  if (op?.type !== "invokeHostFunction" || op.func.type !== "hostFunctionTypeInvokeContract")
    throw new Error("not a contract call");
  return {
    source: tx.source,
    method: String(op.func.invokeContract.functionName),
    args: op.func.invokeContract.args.map((value) => scValToNative(value) as unknown),
  };
};

const ask = { editionId: "ed1", recipient: "ana" };
const problemOf = async (setupOpts: Parameters<typeof setup>[0], input = ask) =>
  (await quoteCollectibleGift(setup(setupOpts).ctx, me, input)).problems[0]?.message;

describe("collectible gift quote", () => {
  it("shows the most the network fee can be, and who gets which copy", async () => {
    const quote = await quoteCollectibleGift(setup().ctx, me, ask);
    expect(quote.ok).toBe(true);
    expect(quote.total).toBe("0.0500000");
    expect(quote.lines.at(-1)).toMatchObject({ label: "You pay, at most", amount: "0.05" });
    expect(quote.gift).toMatchObject({
      title: "Night Drive",
      tokenId: "12",
      recipient: { id: "u-fan", name: "Ana B" },
      newAccountEmail: null,
    });
  });

  it("refuses a listed copy, someone else's copy, yourself and a stranger's username", async () => {
    const edition = (patch: Row) => ({
      id: "ed1",
      tokenId: "12",
      ownerId: "u-artist",
      itemId: "item1",
      item: { title: "Night Drive", chainType: "CONTRACT_NFT", deletedAt: null },
      listing: null,
      ...patch,
    });
    expect(await problemOf({ edition: edition({ listing: { status: "ACTIVE" } }) })).toBe(
      "Take this copy off sale before gifting it.",
    );
    expect(await problemOf({ edition: edition({ ownerId: "someone" }) })).toBe(
      "Pick a copy you own.",
    );
    expect(await problemOf({ fan: { ...fan, id: "u-artist" } })).toBe("You already own this copy.");
    expect(await problemOf({ fan: null })).toMatch(/couldn't find a Bandcoin fan/);
    expect(await problemOf({ xlm: "1.01" })).toBe("You need 0.04 more XLM to send this.");
  });

  it("says a new email gets an account, without making one yet", async () => {
    const { ctx, chain } = setup({ fan: null });
    const quote = await quoteCollectibleGift(ctx, me, { ...ask, recipient: "New@Example.com" });
    expect(quote.ok).toBe(true);
    expect(quote.gift.newAccountEmail).toBe("new@example.com");
    expect(chain.accountForEmail).not.toHaveBeenCalled();
  });
});

describe("collectible gift start", () => {
  it("builds the artist's transfer of that copy to the fan", async () => {
    const { ctx, orders } = setup();
    const started = await startCollectibleGift(ctx, me, ask);
    expect(started.signer).toBe("wallet");
    expect(transferArgs(started.xdr)).toEqual({
      source: wallet.publicKey(),
      method: "transfer",
      args: [wallet.publicKey(), fanWallet, 12],
    });
    expect(orders.get(ORDER)).toMatchObject({
      kind: "NFT_GIFT",
      status: "AWAITING_SIGNATURE",
      currency: "XLM",
      total: "0.0500000",
      breakdown: expect.objectContaining({
        nftGift: expect.objectContaining({
          editionId: "ed1",
          senderId: "u-artist",
          recipientId: "u-fan",
          newAccount: false,
        }),
      }),
    });
  });

  it("makes the account for a new email, then sends to it", async () => {
    const { ctx, chain, orders } = setup({ fan: null });
    const started = await startCollectibleGift(ctx, me, { ...ask, recipient: "new@example.com" });
    expect(chain.accountForEmail).toHaveBeenCalledWith("new@example.com");
    expect(transferArgs(started.xdr).args[1]).toBe(newWallet);
    expect(orders.get(ORDER)).toMatchObject({
      breakdown: expect.objectContaining({
        nftGift: expect.objectContaining({ recipientId: "u-new", newAccount: true }),
      }),
    });
  });

  it("stops before signing when the network fee is above what was shown", async () => {
    const { ctx, orders } = setup({ feeStroops: 600_000 });
    await expect(startCollectibleGift(ctx, me, ask)).rejects.toThrow(/higher than shown/);
    expect(orders.get(ORDER)?.status).toBe("FAILED");
  });

  it("makes nothing when the quote has a problem", async () => {
    const { ctx, db, chain } = setup({ fan: null });
    await expect(startCollectibleGift(ctx, me, { ...ask, recipient: "nobody" })).rejects.toThrow(
      AppError,
    );
    expect(db.order.create).not.toHaveBeenCalled();
    expect(chain.accountForEmail).not.toHaveBeenCalled();
  });
});

describe("collectible gift submit", () => {
  it("sends it, then the fan owns the copy and its unlock pins", async () => {
    const { ctx, db, orders } = setup();
    const { orderId, xdr } = await startCollectibleGift(ctx, me, ask);
    await expect(submitCollectibleGift(ctx, me, { orderId, xdr })).resolves.toEqual({
      orderId,
      status: "DELIVERED",
    });
    expect(db.nftEdition.update).toHaveBeenCalledWith({
      where: { id: "ed1" },
      data: { ownerId: "u-fan" },
    });
    expect(db.ownership.delete).toHaveBeenCalledWith({
      where: { userId_itemId: { userId: "u-artist", itemId: "item1" } },
    });
    expect(db.ownership.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { userId: "u-fan", itemId: "item1", quantity: 1, source: "GIFT" },
      }),
    );
    expect(db.pin.updateMany).toHaveBeenCalledWith({
      where: { unlockEditionId: "ed1" },
      data: { restrictedToUserId: "u-fan" },
    });
    expect(orders.get(orderId)?.status).toBe("DELIVERED");
  });

  it("keeps the artist's other copies counted", async () => {
    const { ctx, db } = setup({ senderQuantity: 3 });
    const { orderId, xdr } = await startCollectibleGift(ctx, me, ask);
    await submitCollectibleGift(ctx, me, { orderId, xdr });
    expect(db.ownership.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { quantity: { decrement: 1 } } }),
    );
    expect(db.ownership.delete).not.toHaveBeenCalled();
  });

  it("fails the order and moves nothing when Stellar rejects it", async () => {
    const { ctx, db, orders } = setup({
      submit: () => Promise.reject(new AppError(ErrorCodes.STELLAR_TX_REJECTED)),
    });
    const { orderId, xdr } = await startCollectibleGift(ctx, me, ask);
    await expect(submitCollectibleGift(ctx, me, { orderId, xdr })).rejects.toThrow(AppError);
    expect(orders.get(orderId)?.status).toBe("FAILED");
    expect(db.nftEdition.update).not.toHaveBeenCalled();
  });

  it("leaves a lost answer for the worker to settle", async () => {
    const { ctx, db, orders } = setup({
      submit: () => Promise.reject(new AppError(ErrorCodes.STELLAR_TX_SUBMIT_FAILED)),
    });
    const { orderId, xdr } = await startCollectibleGift(ctx, me, ask);
    await expect(submitCollectibleGift(ctx, me, { orderId, xdr })).rejects.toThrow(AppError);
    expect(orders.get(orderId)?.status).toBe("SUBMITTED");
    expect(db.nftEdition.update).not.toHaveBeenCalled();
  });
});

describe("giftableCopies", () => {
  it("groups the user's copies by NFT, with listings and unlock progress", async () => {
    const { ctx, db } = setup();
    const item = { id: "item1", title: "Night Drive", coverUrl: "c.jpg", slug: "night-drive" };
    const spot = (claims: number) => ({ _count: { claims } });
    db.nftEdition.findMany.mockResolvedValue([
      {
        id: "ed1",
        tokenId: "12",
        item,
        listing: null,
        unlockPins: [{ spots: [spot(1), spot(1)] }, { spots: [spot(0)] }],
      },
      { id: "ed2", tokenId: "13", item, listing: { status: "ACTIVE" }, unlockPins: [] },
    ]);
    await expect(giftableCopies(ctx, me)).resolves.toEqual([
      {
        itemId: "item1",
        title: "Night Drive",
        coverUrl: "c.jpg",
        slug: "night-drive",
        copies: [
          { editionId: "ed1", tokenId: "12", listed: false, unlocked: 1, locked: 1 },
          { editionId: "ed2", tokenId: "13", listed: true, unlocked: 0, locked: 0 },
        ],
      },
    ]);
    expect(db.nftEdition.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ownerId: "u-artist", item: { chainType: "CONTRACT_NFT", deletedAt: null } },
      }),
    );
  });
});
