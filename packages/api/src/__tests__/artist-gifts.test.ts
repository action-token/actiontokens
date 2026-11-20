import {
  Account,
  Keypair,
  Networks,
  type Transaction,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { describe, expect, it, vi } from "vitest";

import type { Db } from "@actiontokens/db";

import type { SessionUser } from "../context";
import {
  findRecipient,
  listFollowers,
  listSentGifts,
  quoteGift,
  startGift,
  submitGift,
} from "../services/artist/gifts";
import type { ChainGateway } from "../services/chain-gateway";

const wallet = Keypair.random();
const fanWallet = Keypair.random().publicKey();
const issuerKey = Keypair.random().publicKey();
const network = { passphrase: Networks.TESTNET, baseFee: "100" };
const ORDER = "cmvorder0000000000000007";
const storageKey = Keypair.random().publicKey();
const artist: { id: string; fanTokenItemId: string | null; storageAccountId: string | null } = {
  id: "a1",
  fanTokenItemId: "tok1",
  storageAccountId: null,
};
const withStorage = { ...artist, storageAccountId: "st1" };
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
    token?: Row | null;
    fanTrusts?: boolean;
    fan?: Row | null;
    follows?: boolean;
    stored?: string;
    submit?: (xdr: string) => Promise<{ hash: string }>;
  } = {},
) {
  const orders = new Map<string, Row>();
  const token =
    opts.token === undefined
      ? {
          itemId: "tok1",
          code: "LUNA",
          issuer: issuerKey,
          isExternal: false,
          issuerAccount: { publicKey: issuerKey },
        }
      : opts.token;
  const db = {
    classicToken: { findUnique: vi.fn().mockResolvedValue(token) },
    user: {
      findFirst: vi.fn().mockResolvedValue(opts.fan === undefined ? fan : opts.fan),
      findMany: vi.fn().mockResolvedValue([fan]),
    },
    ownership: { upsert: vi.fn().mockResolvedValue({}) },
    chainAccount: {
      findUnique: vi.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(
          where.id === "st1" ? { publicKey: storageKey, activatedAt: new Date() } : null,
        ),
      ),
    },
    follow: {
      findUnique: vi.fn().mockResolvedValue(opts.follows === false ? null : { userId: "u-fan" }),
      findMany: vi
        .fn()
        .mockResolvedValue([{ user: fan }, { user: { ...fan, id: "u2", walletAddress: null } }]),
    },
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
      findMany: vi.fn().mockResolvedValue([]),
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
  const fanAccount = Object.assign(new Account(fanWallet, "9"), {
    balances:
      opts.fanTrusts === false
        ? [{ asset_type: "native", balance: "5" }]
        : [
            { asset_type: "native", balance: "5" },
            {
              asset_type: "credit_alphanum4",
              asset_code: "LUNA",
              asset_issuer: issuerKey,
              balance: "0",
            },
          ],
  });
  const storageAccount = Object.assign(new Account(storageKey, "2"), {
    balances: [
      { asset_type: "native", balance: "3", selling_liabilities: "0" },
      {
        asset_type: "credit_alphanum4",
        asset_code: "LUNA",
        asset_issuer: issuerKey,
        balance: opts.stored ?? "1000000",
        selling_liabilities: "0",
      },
    ],
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
      nftContract: null,
    },
    loadAccount: vi.fn((id: string) =>
      Promise.resolve(
        id === wallet.publicKey()
          ? artistAccount
          : id === fanWallet
            ? fanAccount
            : id === storageKey
              ? storageAccount
              : null,
      ),
    ),
    signWithServerKeys: vi.fn((xdr: string) => Promise.resolve(xdr)),
    submit: vi.fn((xdr: string) =>
      (opts.submit ?? (() => Promise.resolve({ hash: "txhash" })))(xdr),
    ),
  };
  const activity = { set: vi.fn(), facts: () => ({}) };
  return {
    ctx: { db: db as unknown as Db, chain: chain as unknown as ChainGateway, activity },
    db,
    chain,
    orders,
    activity,
  };
}

const ask = { recipient: "ana", amount: 25 };

describe("findRecipient", () => {
  it("looks a fan up by wallet, email or username", async () => {
    const { ctx, db } = setup();
    await findRecipient(ctx, fanWallet);
    expect(db.user.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { walletAddress: fanWallet } }),
    );
    await findRecipient(ctx, "Ana@Example.com");
    expect(db.user.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { email: { equals: "Ana@Example.com", mode: "insensitive" } },
      }),
    );
    await findRecipient(ctx, "@ana");
    expect(db.user.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { username: { equals: "ana", mode: "insensitive" } } }),
    );
  });

  it("finds nobody for empty text or a fan without a wallet", async () => {
    expect(await findRecipient(setup().ctx, "  ")).toBeNull();
    expect(
      await findRecipient(setup({ fan: { ...fan, walletAddress: null } }).ctx, "ana"),
    ).toBeNull();
  });
});

describe("quoteGift", () => {
  it("prices only the network fee; the gift itself is newly issued", async () => {
    const quote = await quoteGift(setup().ctx, me, artist, ask);
    expect(quote).toMatchObject({
      ok: true,
      total: "0.0000100",
      lines: [
        { key: "networkFee", currency: "XLM" },
        { key: "total", currency: "XLM" },
      ],
      gift: { amount: 25, code: "LUNA", recipient: { id: "u-fan", name: "Ana B" } },
    });
  });

  it("explains what's in the way", async () => {
    const problems = async (opts: Parameters<typeof setup>[0], input = ask, who = artist) =>
      (await quoteGift(setup(opts).ctx, me, who, input)).problems.map((p) => p.message);
    expect(await problems({}, ask, { ...artist, fanTokenItemId: null })).toEqual([
      expect.stringContaining("Create your fan token"),
    ]);
    expect(
      await problems({
        token: {
          itemId: "tok1",
          code: "LUNA",
          issuer: issuerKey,
          isExternal: true,
          issuerAccount: null,
        },
      }),
    ).toEqual([expect.stringContaining("issued elsewhere")]);
    expect(await problems({}, { ...ask, amount: 0 })).toEqual([
      expect.stringContaining("whole number"),
    ]);
    expect(await problems({}, { ...ask, recipient: "" })).toEqual(["Choose who to send it to."]);
    expect(await problems({ fan: null })).toEqual([
      expect.stringContaining("couldn't find a Bandcoin fan"),
    ]);
    expect(await problems({ fan: { ...fan, id: "u-artist" } })).toEqual([
      "You can't gift tokens to yourself.",
    ]);
    expect(await problems({ fanTrusts: false })).toEqual([
      expect.stringContaining("hasn't added your token"),
    ]);
    expect((await quoteGift(setup({ xlm: "0" }).ctx, me, artist, ask)).problems).toMatchObject([
      { code: "INSUFFICIENT_FUNDS" },
    ]);
  });
});

describe("gifts from storage", () => {
  const opsOf = (xdr: string) =>
    (TransactionBuilder.fromXDR(xdr, Networks.TESTNET) as Transaction).operations;

  it("goes to followers only", async () => {
    const quote = await quoteGift(setup({ follows: false }).ctx, me, withStorage, ask);
    expect(quote.problems[0]?.message).toBe(
      "Ana B doesn't follow you. Gifts go to your followers.",
    );
  });

  it("pays a fan who trusts the token straight from storage, storage co-signing", async () => {
    const { ctx, chain, db } = setup();
    const quote = await quoteGift(ctx, me, withStorage, ask);
    expect(quote).toMatchObject({
      ok: true,
      total: "0.0000100",
      gift: { from: "STORAGE", claimable: false },
    });
    const started = await startGift(ctx, me, withStorage, ask);
    expect(opsOf(started.xdr)).toMatchObject([
      { type: "payment", source: storageKey, destination: fanWallet, amount: "25.0000000" },
    ]);
    const tx = TransactionBuilder.fromXDR(started.xdr, Networks.TESTNET) as Transaction;
    tx.sign(wallet);
    await submitGift(ctx, me, withStorage, { orderId: started.orderId, xdr: tx.toXDR() });
    expect(chain.signWithServerKeys).toHaveBeenCalledWith(expect.any(String), [storageKey]);
    expect(db.ownership.upsert).toHaveBeenCalled();
  });

  it("leaves a claimable balance for a fan without a trustline, the artist paying its 1 XLM", async () => {
    const { ctx, db } = setup({ fanTrusts: false });
    const quote = await quoteGift(ctx, me, withStorage, ask);
    expect(quote).toMatchObject({ ok: true, total: "1.0000200", gift: { claimable: true } });
    expect(quote.lines[0]).toMatchObject({
      key: "reserve",
      label: "Holds the gift until they claim it",
    });
    const started = await startGift(ctx, me, withStorage, ask);
    expect(opsOf(started.xdr).map((op) => op.type)).toEqual(["payment", "createClaimableBalance"]);
    const tx = TransactionBuilder.fromXDR(started.xdr, Networks.TESTNET) as Transaction;
    tx.sign(wallet);
    await submitGift(ctx, me, withStorage, { orderId: started.orderId, xdr: tx.toXDR() });
    // They own it once they claim it, not before.
    expect(db.ownership.upsert).not.toHaveBeenCalled();
  });

  it("refuses more than storage holds, and allows a token issued elsewhere", async () => {
    const short = await quoteGift(setup({ stored: "10" }).ctx, me, withStorage, ask);
    expect(short.problems[0]?.message).toMatch(/Your storage has 10 LUNA/);
    const external = await quoteGift(
      setup({
        token: {
          itemId: "tok1",
          code: "LUNA",
          issuer: issuerKey,
          isExternal: true,
          issuerAccount: null,
        },
      }).ctx,
      me,
      withStorage,
      ask,
    );
    expect(external.ok).toBe(true);
  });
});

describe("startGift", () => {
  it("issues from the issuer to the fan with the artist's wallet as source, and signs nothing yet", async () => {
    const { ctx, chain, orders } = setup();
    const started = await startGift(ctx, me, artist, ask);
    expect(started).toMatchObject({ orderId: ORDER, signer: "wallet" });
    const tx = TransactionBuilder.fromXDR(started.xdr, Networks.TESTNET) as Transaction;
    expect(tx.source).toBe(wallet.publicKey());
    expect(tx.operations[0]).toMatchObject({
      type: "payment",
      source: issuerKey,
      destination: fanWallet,
      amount: "25.0000000",
    });
    expect(chain.submit).not.toHaveBeenCalled();
    expect(orders.get(ORDER)).toMatchObject({
      kind: "GIFT",
      currency: "XLM",
      method: "WALLET",
      itemId: "tok1",
      quantity: 25,
      status: "AWAITING_SIGNATURE",
      breakdown: { giftDetails: { recipientId: "u-fan", amount: 25 } },
    });
  });

  it("refuses to start when the quote isn't ok", async () => {
    const { ctx, db } = setup({ fanTrusts: false });
    await expect(startGift(ctx, me, artist, ask)).rejects.toMatchObject({
      message: expect.stringContaining("hasn't added your token") as unknown,
    });
    expect(db.order.create).not.toHaveBeenCalled();
  });
});

describe("submitGift", () => {
  it("has the issuer co-sign, sends it, and records the fan's new tokens", async () => {
    const { ctx, chain, db, orders, activity } = setup();
    const { xdr } = await startGift(ctx, me, artist, ask);
    await expect(submitGift(ctx, me, artist, { orderId: ORDER, xdr })).resolves.toEqual({
      orderId: ORDER,
      status: "DELIVERED",
    });
    expect(chain.signWithServerKeys).toHaveBeenCalledWith(xdr, [issuerKey]);
    expect(chain.submit).toHaveBeenCalledTimes(1);
    expect(db.ownership.upsert).toHaveBeenCalledWith({
      where: { userId_itemId: { userId: "u-fan", itemId: "tok1" } },
      create: { userId: "u-fan", itemId: "tok1", quantity: 25, source: "GIFT" },
      update: { quantity: { increment: 25 } },
    });
    expect(orders.get(ORDER)).toMatchObject({ status: "DELIVERED" });
    expect(activity.set).toHaveBeenCalledWith({ txHash: "txhash" });
  });

  it("fails the order and gives nothing when the network says no", async () => {
    const { ctx, db, orders } = setup({ submit: () => Promise.reject(new Error("tx_failed")) });
    const { xdr } = await startGift(ctx, me, artist, ask);
    await expect(submitGift(ctx, me, artist, { orderId: ORDER, xdr })).rejects.toThrow("tx_failed");
    expect(db.ownership.upsert).not.toHaveBeenCalled();
    expect(orders.get(ORDER)).toMatchObject({ status: "FAILED" });
  });

  it("won't send a different transaction than the one it built", async () => {
    const { ctx, chain } = setup();
    const { xdr } = await startGift(ctx, me, artist, ask);
    const other = new TransactionBuilder(new Account(wallet.publicKey(), "50"), {
      fee: "100",
      networkPassphrase: Networks.TESTNET,
    })
      .setTimeout(60)
      .build()
      .toXDR();
    expect(xdr).not.toBe(other);
    await expect(submitGift(ctx, me, artist, { orderId: ORDER, xdr: other })).rejects.toMatchObject(
      {
        message: "That transaction doesn't belong to this order.",
      },
    );
    expect(chain.submit).not.toHaveBeenCalled();
  });

  it("won't take someone else's order or another kind of order, and only sends once", async () => {
    const { ctx, orders, chain } = setup();
    const { xdr } = await startGift(ctx, me, artist, ask);
    await expect(
      submitGift(ctx, { ...me, id: "other" }, artist, { orderId: ORDER, xdr }),
    ).rejects.toMatchObject({ message: "Order not found" });
    await submitGift(ctx, me, artist, { orderId: ORDER, xdr });
    await expect(submitGift(ctx, me, artist, { orderId: ORDER, xdr })).rejects.toMatchObject({
      message: expect.stringContaining("already") as unknown,
    });
    expect(chain.submit).toHaveBeenCalledTimes(1);
    orders.get(ORDER)!.kind = "ISSUER_SETUP";
    await expect(submitGift(ctx, me, artist, { orderId: ORDER, xdr })).rejects.toMatchObject({
      message: "Order not found",
    });
  });

  it("fails an expired quote instead of sending", async () => {
    const { ctx, orders, chain } = setup();
    const { xdr } = await startGift(ctx, me, artist, ask);
    orders.get(ORDER)!.quoteExpiresAt = new Date(Date.now() - 1000);
    await expect(submitGift(ctx, me, artist, { orderId: ORDER, xdr })).rejects.toBeTruthy();
    expect(chain.submit).not.toHaveBeenCalled();
    expect(orders.get(ORDER)).toMatchObject({ status: "FAILED" });
  });
});

describe("lists", () => {
  it("shows delivered token and NFT gifts with who got them", async () => {
    const { ctx, db } = setup();
    const at = new Date("2026-11-01T00:00:00Z");
    db.order.findMany.mockResolvedValue([
      {
        id: "o1",
        createdAt: at,
        txHash: "h1",
        item: null,
        breakdown: { giftDetails: { recipientId: "u-fan", amount: 10, code: "LUNA" } },
      },
      {
        id: "o3",
        createdAt: at,
        txHash: "h3",
        item: { title: "Night Drive" },
        breakdown: { nftGift: { recipientId: "u-fan", tokenId: "12" } },
      },
      { id: "o2", createdAt: new Date(), txHash: "h2", item: null, breakdown: null },
    ]);
    const sent = await listSentGifts(ctx, me, artist);
    const recipient = { id: "u-fan", name: "Ana B", image: null };
    expect(sent).toEqual([
      {
        id: "o1",
        createdAt: at,
        txHash: "h1",
        tokens: { amount: 10, code: "LUNA" },
        copy: null,
        state: null,
        declined: false,
        recipient,
      },
      {
        id: "o3",
        createdAt: at,
        txHash: "h3",
        tokens: null,
        copy: { title: "Night Drive", tokenId: "12" },
        state: null,
        declined: false,
        recipient,
      },
    ]);
    expect(db.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { kind: { in: ["GIFT", "NFT_GIFT"] }, buyerId: "u-artist", status: "DELIVERED" },
      }),
    );
  });

  it("lists followers that have a wallet", async () => {
    const { ctx, db } = setup();
    const followers = await listFollowers(ctx, artist, " an ");
    expect(followers).toEqual([
      { id: "u-fan", name: "Ana B", username: "ana", wallet: fanWallet, image: null },
    ]);
    expect(db.follow.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ artistId: "a1" }) as unknown }),
    );
  });
});
