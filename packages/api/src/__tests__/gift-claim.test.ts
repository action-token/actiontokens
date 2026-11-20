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

import { buildClaimGift } from "@actiontokens/chain";
import type { Db } from "@actiontokens/db";

import type { SessionUser } from "../context";
import type { ChainGateway } from "../services/chain-gateway";
import { listGifts, prepareGiftClaim, submitGiftClaim } from "../services/gifts/claim";

const fanKeys = Keypair.random();
const issuer = Keypair.random().publicKey();
const network = { passphrase: Networks.TESTNET, baseFee: "100" };
const BALANCE = `00000000${"ab".repeat(32)}`;
const OTHER = `00000000${"cd".repeat(32)}`;
const fan: SessionUser = {
  id: "u-fan",
  role: "FAN",
  walletAddress: fanKeys.publicKey(),
  walletType: "freighter",
};

function setup(opts: { trusts?: boolean; xlm?: string; declined?: { balanceId: string }[] } = {}) {
  const account = Object.assign(new Account(fanKeys.publicKey(), "4"), {
    subentry_count: 0,
    balances: [
      { asset_type: "native", balance: opts.xlm ?? "5", selling_liabilities: "0" },
      ...(opts.trusts
        ? [
            {
              asset_type: "credit_alphanum4",
              asset_code: "LUNA",
              asset_issuer: issuer,
              balance: "0",
              selling_liabilities: "0",
            },
          ]
        : []),
    ],
  });
  const db = {
    classicToken: {
      findMany: vi.fn().mockResolvedValue([
        {
          code: "LUNA",
          issuer,
          item: { id: "fan-item", title: "Luna fan token", organization: { name: "Luna", slug: "luna" } },
        },
      ]),
      findUnique: vi.fn().mockResolvedValue({ itemId: "fan-item" }),
    },
    ownership: { upsert: vi.fn().mockResolvedValue({}) },
    declinedGift: {
      findMany: vi.fn().mockResolvedValue(opts.declined ?? []),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      upsert: vi.fn().mockResolvedValue({}),
    },
    user: {
      findMany: vi
        .fn()
        .mockResolvedValue([{ walletAddress: "GX", username: "mira", displayName: "Mira" }]),
    },
  };
  const chain = {
    config: {
      network,
      assets: {
        bandcoin: { code: "BANDCOIN", issuer: Keypair.random().publicKey() },
        usdc: { code: "USDC", issuer: Keypair.random().publicKey() },
      },
    },
    claimableFor: vi.fn().mockResolvedValue([
      { id: BALANCE, code: "LUNA", issuer, amount: "25.0000000", sponsor: "GSTORAGE" },
      { id: OTHER, code: "UNKNOWN", issuer, amount: "1.0000000", sponsor: "GX" },
    ]),
    loadAccount: vi.fn().mockResolvedValue(account),
    signForCustodialUser: vi.fn((xdr: string) => Promise.resolve(xdr)),
    submit: vi.fn((_xdr: string) => Promise.resolve({ hash: "txhash" })),
  };
  const activity = { set: vi.fn(), facts: () => ({}) };
  const ctx = { db: db as unknown as Db, chain: chain as unknown as ChainGateway, activity };
  return { ctx, chain, db, activity };
}

describe("gifts waiting to be claimed", () => {
  it("lists every token waiting, with who sent it and what claiming costs", async () => {
    const gifts = await listGifts(setup().ctx, fan);
    expect(gifts).toHaveLength(2);
    expect(gifts[0]).toMatchObject({
      balanceId: BALANCE,
      code: "LUNA",
      amount: "25.0000000",
      title: "Luna fan token",
      artist: { name: "Luna" },
      from: { address: "GSTORAGE", username: null, name: null },
      cost: { total: "0.5000200" },
    });
    // a token someone sent from their wallet: no item, named by its code and the sender
    expect(gifts[1]).toMatchObject({
      balanceId: OTHER,
      code: "UNKNOWN",
      title: "UNKNOWN",
      artist: null,
      from: { address: "GX", username: "mira", name: "Mira" },
    });
    expect((await listGifts(setup({ trusts: true }).ctx, fan))[0]?.cost.total).toBe("0.0000100");
  });

  it("builds the claim, opening the trustline when needed, and checks the XLM first", async () => {
    const prepared = await prepareGiftClaim(setup().ctx, fan, BALANCE);
    const ops = (TransactionBuilder.fromXDR(prepared.xdr, Networks.TESTNET) as Transaction)
      .operations;
    expect(ops.map((op) => op.type)).toEqual(["changeTrust", "claimClaimableBalance"]);
    await expect(prepareGiftClaim(setup({ xlm: "1.4" }).ctx, fan, BALANCE)).rejects.toThrow(
      /more XLM to claim/,
    );
    await expect(prepareGiftClaim(setup().ctx, fan, `00000000${"ef".repeat(32)}`)).rejects.toThrow(
      /isn't waiting/,
    );
  });

  it("sends only that exact claim, then records the fan's tokens", async () => {
    const { ctx, chain, db } = setup();
    const { xdr } = await prepareGiftClaim(ctx, fan, BALANCE);
    await expect(submitGiftClaim(ctx, fan, { balanceId: BALANCE, xdr })).resolves.toMatchObject({
      txHash: "txhash",
      amount: "25.0000000",
    });
    expect(db.ownership.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ quantity: 25, source: "GIFT" }),
      }),
    );
    // If the fan had declined it first, that is forgotten now.
    expect(db.declinedGift.deleteMany).toHaveBeenCalledWith({ where: { balanceId: BALANCE } });

    // A claim of another balance, or one that also pays someone, is refused.
    const other = buildClaimGift({
      receiver: new Account(fanKeys.publicKey(), "4"),
      network,
      balanceId: OTHER,
      asset: new Asset("LUNA", issuer),
      openTrustline: false,
    }).xdr;
    await expect(submitGiftClaim(ctx, fan, { balanceId: BALANCE, xdr: other })).rejects.toThrow(
      /isn't the one we prepared/,
    );
    const sneaky = new TransactionBuilder(new Account(fanKeys.publicKey(), "4"), {
      fee: "100",
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(Operation.payment({ destination: issuer, asset: Asset.native(), amount: "4" }))
      .addOperation(Operation.claimClaimableBalance({ balanceId: BALANCE }))
      .setTimeout(60)
      .build()
      .toXDR();
    await expect(submitGiftClaim(ctx, fan, { balanceId: BALANCE, xdr: sneaky })).rejects.toThrow(
      /isn't the one we prepared/,
    );
    expect(chain.submit).toHaveBeenCalledTimes(1);
  });
});
