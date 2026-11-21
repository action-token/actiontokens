import {
  Account,
  Asset,
  Keypair,
  Networks,
  Operation,
  type Transaction,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { describe, expect, it, vi } from "vitest";

import { buildStorageTakeBack } from "@actiontokens/chain";
import type { Db } from "@actiontokens/db";

import type { SessionUser } from "../context";
import { prepareGiftTakeBack, submitGiftTakeBack } from "../services/artist/gift-take-back";
import { listSentGifts } from "../services/artist/gifts";
import type { ChainGateway } from "../services/chain-gateway";
import { listGifts, prepareGiftClaim } from "../services/gifts/claim";
import { listSentWaiting, prepareTakeBack, submitTakeBack } from "../services/gifts/take-back";

const network = { passphrase: Networks.TESTNET, baseFee: "100" };
const issuer = Keypair.random().publicKey();
const id = (pair: string) => `00000000${pair.repeat(32)}`;
const parse = (xdr: string) => TransactionBuilder.fromXDR(xdr, Networks.TESTNET) as Transaction;
type Row = Record<string, unknown>;

const walletOf = (address: string, opts: { xlm?: string; trusts?: boolean } = {}) =>
  Object.assign(new Account(address, "4"), {
    subentry_count: 0,
    balances: [
      { asset_type: "native", balance: opts.xlm ?? "5", selling_liabilities: "0" },
      ...(opts.trusts === false
        ? []
        : [
            {
              asset_type: "credit_alphanum4",
              asset_code: "LUNA",
              asset_issuer: issuer,
              balance: "10",
              selling_liabilities: "0",
            },
          ]),
    ],
  });

describe("taking back a token you sent (wallet)", () => {
  const sender = Keypair.random().publicKey();
  const receiver = Keypair.random().publicKey();
  const SENT = id("ab");
  const RECEIVED = id("cd");
  const me: SessionUser = {
    id: "u-me",
    role: "FAN",
    walletAddress: sender,
    walletType: "freighter",
  };

  function setup(opts: { trusts?: boolean; xlm?: string; sends?: Row[]; declined?: Row[] } = {}) {
    const db = {
      classicToken: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn() },
      ownership: { upsert: vi.fn() },
      declinedGift: {
        findMany: vi.fn().mockResolvedValue(opts.declined ?? []),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        upsert: vi.fn().mockResolvedValue({}),
      },
      user: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ walletAddress: receiver, username: "mira", displayName: "Mira" }]),
      },
      order: {
        findMany: vi.fn().mockResolvedValue(opts.sends ?? []),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const chain = {
      config: {
        network,
        assets: {
          actionToken: { code: "ACTION", issuer: Keypair.random().publicKey() },
          usdc: { code: "USDC", issuer: Keypair.random().publicKey() },
        },
      },
      claimableFor: vi.fn().mockResolvedValue([
        {
          id: SENT,
          code: "LUNA",
          issuer,
          amount: "25.0000000",
          sponsor: sender,
          claimants: [receiver, sender],
        },
        {
          id: RECEIVED,
          code: "LUNA",
          issuer,
          amount: "3.0000000",
          sponsor: receiver,
          claimants: [sender, receiver],
        },
      ]),
      loadAccount: vi.fn().mockResolvedValue(walletOf(sender, opts)),
      signForCustodialUser: vi.fn((xdr: string) => Promise.resolve(xdr)),
      submit: vi.fn((_xdr: string) => Promise.resolve({ hash: "backhash" })),
    };
    const activity = { set: vi.fn(), facts: () => ({}) };
    const ctx = { db: db as unknown as Db, chain: chain as unknown as ChainGateway, activity };
    return { ctx, chain, db, activity };
  }

  it("keeps your own waiting send out of Pending gifts and can't accept it as a gift", async () => {
    const { ctx } = setup();
    expect((await listGifts(ctx, me)).map((gift) => gift.balanceId)).toEqual([RECEIVED]);
    await expect(prepareGiftClaim(ctx, me, SENT)).rejects.toThrow(/isn't waiting/);
  });

  it("lists what's still waiting, with who it's for and what taking back costs", async () => {
    expect(await listSentWaiting(setup().ctx, me)).toMatchObject([
      {
        balanceId: SENT,
        code: "LUNA",
        amount: "25.0000000",
        to: { address: receiver, username: "mira", name: "Mira" },
        cost: { total: "0.0000100" },
      },
    ]);
    // The sender closed the line since: opening it again is part of the cost.
    const closed = await listSentWaiting(setup({ trusts: false }).ctx, me);
    expect(closed[0]?.cost.total).toBe("0.5000200");
  });

  it("builds the claim back into the sender's wallet, only for their own send", async () => {
    const { ctx } = setup();
    const prepared = await prepareTakeBack(ctx, me, SENT);
    expect(parse(prepared.xdr).operations).toMatchObject([
      { type: "claimClaimableBalance", balanceId: SENT },
    ]);
    expect(prepared.signer).toBe("wallet");
    await expect(prepareTakeBack(ctx, me, RECEIVED)).rejects.toThrow(/isn't waiting any more/);
    await expect(prepareTakeBack(setup({ xlm: "1" }).ctx, me, SENT)).rejects.toThrow(
      /more XLM to take this back/,
    );
  });

  it("sends it, marks the newest matching send, and changes no ownership", async () => {
    const send = (orderId: string, extra: Row = {}) => ({
      id: orderId,
      breakdown: {
        sendDetails: { to: receiver, code: "LUNA", issuer, amount: "25", mode: "gift", ...extra },
      },
    });
    const { ctx, chain, db, activity } = setup({
      sends: [
        send("o-done", { takenBack: { txHash: "old", at: "2026-11-01" } }),
        send("o-paid", { mode: "payment" }),
        send("o-match"),
        send("o-older"),
      ],
    });
    const { xdr } = await prepareTakeBack(ctx, me, SENT);
    await expect(submitTakeBack(ctx, me, { balanceId: SENT, xdr })).resolves.toEqual({
      txHash: "backhash",
      code: "LUNA",
      amount: "25.0000000",
    });
    expect(chain.submit).toHaveBeenCalledTimes(1);
    expect(db.order.update).toHaveBeenCalledTimes(1);
    expect(db.order.update).toHaveBeenCalledWith({
      where: { id: "o-match" },
      data: {
        breakdown: {
          sendDetails: expect.objectContaining({
            mode: "gift",
            takenBack: expect.objectContaining({ txHash: "backhash" }),
          }),
        },
      },
    });
    expect(db.ownership.upsert).not.toHaveBeenCalled();
    expect(activity.set).toHaveBeenCalledWith(
      expect.objectContaining({ targetType: "ClaimableBalance", txHash: "backhash" }),
    );
  });

  it("refuses a transaction that isn't exactly that claim", async () => {
    const { ctx, chain } = setup();
    const sneaky = new TransactionBuilder(new Account(sender, "4"), {
      fee: "100",
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(Operation.payment({ destination: issuer, asset: Asset.native(), amount: "4" }))
      .addOperation(Operation.claimClaimableBalance({ balanceId: SENT }))
      .setTimeout(60)
      .build()
      .toXDR();
    await expect(submitTakeBack(ctx, me, { balanceId: SENT, xdr: sneaky })).rejects.toThrow(
      /isn't the one we prepared/,
    );
    expect(chain.submit).not.toHaveBeenCalled();
  });
});

describe("an artist taking back a gift from storage", () => {
  const wallet = Keypair.random().publicKey();
  const storage = Keypair.random().publicKey();
  const fanA = Keypair.random().publicKey();
  const fanB = Keypair.random().publicKey();
  const artist = { storageAccountId: "st1" };
  const me: SessionUser = {
    id: "u-artist",
    role: "ARTIST",
    walletAddress: wallet,
    walletType: "freighter",
  };
  const gift = (orderId: string, to: string, extra: Row = {}): Row => ({
    id: orderId,
    kind: "GIFT",
    status: "DELIVERED",
    buyerId: "u-artist",
    createdAt: new Date("2026-11-10T00:00:00Z"),
    txHash: `hash-${orderId}`,
    item: null,
    breakdown: {
      giftDetails: {
        itemId: "tok1",
        recipientId: to === fanA ? "u-a" : "u-b",
        recipientWallet: to,
        code: "LUNA",
        issuer,
        amount: 25,
        from: "STORAGE",
        claimable: true,
        ...extra,
      },
    },
  });
  const balance = (balanceId: string, to: string) => ({
    id: balanceId,
    code: "LUNA",
    issuer,
    amount: "25.0000000",
    sponsor: storage,
    claimants: [to, storage],
  });

  function setup(opts: { orders?: Row[]; balances?: Row[]; xlm?: string; declined?: Row[] } = {}) {
    const orders = opts.orders ?? [gift("o1", fanA)];
    const db = {
      chainAccount: {
        findUnique: vi.fn(({ where }: { where: { id: string } }) =>
          Promise.resolve(
            where.id === "st1" ? { publicKey: storage, activatedAt: new Date() } : null,
          ),
        ),
      },
      order: {
        findMany: vi.fn().mockResolvedValue(orders),
        findUnique: vi.fn(({ where }: { where: { id: string } }) =>
          Promise.resolve(orders.find((order) => order.id === where.id) ?? null),
        ),
        update: vi.fn().mockResolvedValue({}),
      },
      user: { findMany: vi.fn().mockResolvedValue([]) },
      declinedGift: {
        findMany: vi.fn().mockResolvedValue(opts.declined ?? []),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        upsert: vi.fn().mockResolvedValue({}),
      },
    };
    const chain = {
      config: { network },
      claimableFor: vi.fn().mockResolvedValue(opts.balances ?? [balance(id("ab"), fanA)]),
      loadAccount: vi.fn().mockResolvedValue(walletOf(wallet, { xlm: opts.xlm })),
      signForCustodialUser: vi.fn((xdr: string) => Promise.resolve(xdr)),
      signWithServerKeys: vi.fn((xdr: string, _keys: string[]) => Promise.resolve(xdr)),
      submit: vi.fn((_xdr: string) => Promise.resolve({ hash: "backhash" })),
    };
    const activity = { set: vi.fn(), facts: () => ({}) };
    const ctx = { db: db as unknown as Db, chain: chain as unknown as ChainGateway, activity };
    return { ctx, chain, db, activity };
  }

  it("marks sent gifts as waiting, taken back or delivered", async () => {
    const { ctx } = setup({
      orders: [
        gift("o-waiting", fanA),
        // Identical to the one above, but only one balance is left: the newest pairs with it.
        gift("o-accepted", fanA),
        gift("o-back", fanB, { takenBack: { txHash: "t", at: "2026-11-11" } }),
        gift("o-direct", fanB, { claimable: false }),
      ],
      balances: [balance(id("ab"), fanA), balance(id("ef"), fanB)],
    });
    const sent = await listSentGifts(ctx, me, artist);
    expect(sent.map((row) => [row.id, row.state])).toEqual([
      ["o-waiting", "waiting"],
      ["o-accepted", null],
      ["o-back", "takenBack"],
      ["o-direct", null],
    ]);
  });

  it("builds the take-back: storage claims the balance and returns the artist's 1 XLM", async () => {
    const { ctx } = setup();
    const prepared = await prepareGiftTakeBack(ctx, me, artist, "o1");
    const tx = parse(prepared.xdr);
    expect(tx.source).toBe(wallet);
    expect(tx.operations).toMatchObject([
      { type: "claimClaimableBalance", source: storage, balanceId: id("ab") },
      { type: "payment", source: storage, destination: wallet, amount: "1.0000000" },
    ]);
    await expect(prepareGiftTakeBack(setup({ xlm: "1" }).ctx, me, artist, "o1")).rejects.toThrow(
      /more XLM for the network fee/,
    );
  });

  it("refuses a gift that isn't the artist's, isn't waiting, or was already taken back", async () => {
    const other: SessionUser = { ...me, id: "u-other" };
    await expect(prepareGiftTakeBack(setup().ctx, other, artist, "o1")).rejects.toThrow(
      /not found/i,
    );
    await expect(
      prepareGiftTakeBack(setup({ balances: [] }).ctx, me, artist, "o1"),
    ).rejects.toThrow(/isn't waiting any more/);
    const back = gift("o1", fanA, { takenBack: { txHash: "t", at: "2026-11-11" } });
    await expect(
      prepareGiftTakeBack(setup({ orders: [back] }).ctx, me, artist, "o1"),
    ).rejects.toThrow(/already took this gift back/);
    await expect(
      prepareGiftTakeBack(setup().ctx, me, { storageAccountId: null }, "o1"),
    ).rejects.toThrow(/isn't waiting any more/);
  });

  it("has storage sign, sends it and marks the gift order", async () => {
    const { ctx, chain, db, activity } = setup();
    const { xdr } = await prepareGiftTakeBack(ctx, me, artist, "o1");
    await expect(submitGiftTakeBack(ctx, me, artist, { orderId: "o1", xdr })).resolves.toEqual({
      txHash: "backhash",
      code: "LUNA",
      amount: 25,
    });
    expect(chain.signWithServerKeys).toHaveBeenCalledWith(xdr, [storage]);
    expect(chain.signForCustodialUser).not.toHaveBeenCalled();
    expect(db.order.update).toHaveBeenCalledWith({
      where: { id: "o1" },
      data: {
        breakdown: {
          giftDetails: expect.objectContaining({
            claimable: true,
            takenBack: expect.objectContaining({ txHash: "backhash" }),
          }),
        },
      },
    });
    expect(activity.set).toHaveBeenCalledWith({ targetType: "Order", targetId: "o1" });
    expect(activity.set).toHaveBeenCalledWith({ txHash: "backhash" });
  });

  it("signs for an email account before storage does", async () => {
    const { ctx, chain } = setup();
    const custodial: SessionUser = { ...me, walletType: "emailPass", email: "luna@example.com" };
    const prepared = await prepareGiftTakeBack(ctx, custodial, artist, "o1");
    expect(prepared.signer).toBe("custodial");
    await submitGiftTakeBack(ctx, custodial, artist, { orderId: "o1", xdr: prepared.xdr });
    expect(chain.signForCustodialUser).toHaveBeenCalledWith(prepared.xdr, "luna@example.com");
  });

  it("never lets storage sign anything but that exact take-back", async () => {
    const { ctx, chain } = setup();
    const built = (change: (builder: TransactionBuilder) => TransactionBuilder) =>
      change(
        new TransactionBuilder(new Account(wallet, "4"), {
          fee: "100",
          networkPassphrase: Networks.TESTNET,
        }),
      )
        .setTimeout(60)
        .build()
        .toXDR();
    const claim = Operation.claimClaimableBalance({ source: storage, balanceId: id("ab") });
    const pay = (destination: string, amount: string, asset = Asset.native()) =>
      Operation.payment({ source: storage, destination, asset, amount });
    const attempts = [
      // more XLM out of storage
      built((tx) => tx.addOperation(claim).addOperation(pay(wallet, "50"))),
      // the XLM to someone else
      built((tx) => tx.addOperation(claim).addOperation(pay(fanB, "1"))),
      // storage's tokens instead of XLM
      built((tx) =>
        tx.addOperation(claim).addOperation(pay(wallet, "1", new Asset("LUNA", issuer))),
      ),
      // an extra payment out of storage
      built((tx) =>
        tx.addOperation(claim).addOperation(pay(wallet, "1")).addOperation(pay(wallet, "1")),
      ),
      // another balance
      buildStorageTakeBack({
        sender: new Account(wallet, "4"),
        network,
        storage,
        balanceId: id("ef"),
      }).xdr,
      "not-a-transaction",
    ];
    for (const xdr of attempts)
      await expect(submitGiftTakeBack(ctx, me, artist, { orderId: "o1", xdr })).rejects.toThrow(
        /isn't the one we prepared|isn't a valid transaction/,
      );
    expect(chain.signWithServerKeys).not.toHaveBeenCalled();
    expect(chain.submit).not.toHaveBeenCalled();
  });
});
