import { Account, Keypair, Networks } from "@stellar/stellar-sdk";
import { describe, expect, it, vi } from "vitest";

import type { Db } from "@bandcoin/db";

import type { SessionUser } from "../context";
import { listSentGifts } from "../services/artist/gifts";
import type { ChainGateway } from "../services/chain-gateway";
import { listGifts } from "../services/gifts/claim";
import { declineGift, undoDecline } from "../services/gifts/decline";
import { listSentWaiting, prepareTakeBack, submitTakeBack } from "../services/gifts/take-back";

const network = { passphrase: Networks.TESTNET, baseFee: "100" };
const issuer = Keypair.random().publicKey();
const fanWallet = Keypair.random().publicKey();
const senderWallet = Keypair.random().publicKey();
const storage = Keypair.random().publicKey();
const id = (pair: string) => `00000000${pair.repeat(32)}`;
const FROM_SENDER = id("ab");
const FROM_STORAGE = id("cd");
const OWN_SEND = id("ef");
type Row = Record<string, unknown>;

const fan: SessionUser = {
  id: "u-fan",
  role: "FAN",
  walletAddress: fanWallet,
  walletType: "freighter",
};
const sender: SessionUser = { ...fan, id: "u-sender", walletAddress: senderWallet };

const balance = (balanceId: string, from: string, to: string) => ({
  id: balanceId,
  code: "LUNA",
  issuer,
  amount: "25.0000000",
  sponsor: from,
  claimants: [to, from],
});
const balances = [
  balance(FROM_SENDER, senderWallet, fanWallet),
  balance(FROM_STORAGE, storage, fanWallet),
  balance(OWN_SEND, fanWallet, senderWallet),
];

/** A database that really keeps the declined rows, so the lists can be read back. */
function setup(opts: { orders?: Row[] } = {}) {
  const declined: { userId: string; balanceId: string }[] = [];
  type Where = { userId?: string; balanceId?: string | { in: string[] } };
  const matches = (row: { userId: string; balanceId: string }, where: Where) =>
    (where.userId === undefined || row.userId === where.userId) &&
    (where.balanceId === undefined ||
      (typeof where.balanceId === "string"
        ? row.balanceId === where.balanceId
        : where.balanceId.in.includes(row.balanceId)));
  const db = {
    declinedGift: {
      upsert: vi.fn(({ create }: { create: { userId: string; balanceId: string } }) => {
        if (!declined.some((row) => matches(row, create))) declined.push(create);
        return Promise.resolve(create);
      }),
      findMany: vi.fn(({ where }: { where: Where }) =>
        Promise.resolve(declined.filter((row) => matches(row, where))),
      ),
      deleteMany: vi.fn(({ where }: { where: Where }) => {
        const before = declined.length;
        for (let at = declined.length - 1; at >= 0; at--)
          if (matches(declined[at]!, where)) declined.splice(at, 1);
        return Promise.resolve({ count: before - declined.length });
      }),
    },
    classicToken: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn() },
    user: { findMany: vi.fn().mockResolvedValue([]) },
    chainAccount: {
      findUnique: vi.fn().mockResolvedValue({ publicKey: storage, activatedAt: new Date() }),
    },
    order: {
      findMany: vi.fn().mockResolvedValue(opts.orders ?? []),
      update: vi.fn().mockResolvedValue({}),
    },
  };
  const account = (address: string) =>
    Object.assign(new Account(address, "4"), {
      subentry_count: 0,
      balances: [
        { asset_type: "native", balance: "5", selling_liabilities: "0" },
        {
          asset_type: "credit_alphanum4",
          asset_code: "LUNA",
          asset_issuer: issuer,
          balance: "10",
          selling_liabilities: "0",
        },
      ],
    });
  const chain = {
    config: {
      network,
      assets: {
        bandcoin: { code: "BANDCOIN", issuer: Keypair.random().publicKey() },
        usdc: { code: "USDC", issuer: Keypair.random().publicKey() },
      },
    },
    claimableFor: vi.fn((address: string) =>
      Promise.resolve(balances.filter((entry) => entry.claimants.includes(address))),
    ),
    loadAccount: vi.fn((address: string) => Promise.resolve(account(address))),
    signForCustodialUser: vi.fn((xdr: string) => Promise.resolve(xdr)),
    submit: vi.fn((_xdr: string) => Promise.resolve({ hash: "backhash" })),
  };
  const activity = { set: vi.fn(), facts: () => ({}) };
  const ctx = { db: db as unknown as Db, chain: chain as unknown as ChainGateway, activity };
  return { ctx, db, chain, activity, declined };
}

describe("declining a pending gift", () => {
  it("marks the gift declined for the fan, and puts it back on undo", async () => {
    const { ctx, activity } = setup();
    const flags = async () =>
      (await listGifts(ctx, fan)).map((gift) => [gift.balanceId, gift.declined]);
    expect(await flags()).toEqual([
      [FROM_SENDER, false],
      [FROM_STORAGE, false],
    ]);

    await expect(declineGift(ctx, fan, FROM_SENDER)).resolves.toEqual({
      balanceId: FROM_SENDER,
      declined: true,
    });
    expect(activity.set).toHaveBeenCalledWith({
      targetType: "ClaimableBalance",
      targetId: FROM_SENDER,
    });
    expect(await flags()).toEqual([
      [FROM_SENDER, true],
      [FROM_STORAGE, false],
    ]);

    await undoDecline(ctx, fan, FROM_SENDER);
    expect(await flags()).toEqual([
      [FROM_SENDER, false],
      [FROM_STORAGE, false],
    ]);
  });

  it("is fine to decline twice, and keeps one row", async () => {
    const { ctx, declined } = setup();
    await declineGift(ctx, fan, FROM_SENDER);
    await declineGift(ctx, fan, FROM_SENDER);
    expect(declined).toEqual([{ userId: "u-fan", balanceId: FROM_SENDER }]);
  });

  it("only declines a gift really waiting for you: not your own send, not an unknown one", async () => {
    const { ctx, declined } = setup();
    await expect(declineGift(ctx, fan, OWN_SEND)).rejects.toThrow(/isn't waiting for you/);
    await expect(declineGift(ctx, fan, id("99"))).rejects.toThrow(/isn't waiting for you/);
    expect(declined).toEqual([]);
  });

  it("shows the sender 'declined' on their waiting send, and forgets it when they take it back", async () => {
    const { ctx, declined } = setup();
    expect((await listSentWaiting(ctx, sender))[0]).toMatchObject({
      balanceId: FROM_SENDER,
      declined: false,
    });
    await declineGift(ctx, fan, FROM_SENDER);
    expect((await listSentWaiting(ctx, sender))[0]).toMatchObject({
      balanceId: FROM_SENDER,
      declined: true,
    });
    // One fan's decline doesn't mark another's gift for them.
    expect((await listGifts(ctx, sender)).map((gift) => gift.declined)).toEqual([false]);

    const { xdr } = await prepareTakeBack(ctx, sender, FROM_SENDER);
    await submitTakeBack(ctx, sender, { balanceId: FROM_SENDER, xdr });
    expect(declined).toEqual([]);
  });

  it("shows the artist which waiting gift was declined", async () => {
    const order = (orderId: string, wallet: string): Row => ({
      id: orderId,
      createdAt: new Date("2026-11-10T00:00:00Z"),
      txHash: `hash-${orderId}`,
      item: null,
      breakdown: {
        giftDetails: {
          recipientId: "u-fan",
          recipientWallet: wallet,
          code: "LUNA",
          issuer,
          amount: 25,
          from: "STORAGE",
          claimable: true,
        },
      },
    });
    const { ctx } = setup({ orders: [order("o1", fanWallet)] });
    const artist = { storageAccountId: "st1" };
    const row = async () => (await listSentGifts(ctx, { id: "u-artist" }, artist))[0];
    expect(await row()).toMatchObject({ id: "o1", state: "waiting", declined: false });
    await declineGift(ctx, fan, FROM_STORAGE);
    expect(await row()).toMatchObject({ id: "o1", state: "waiting", declined: true });
  });
});
