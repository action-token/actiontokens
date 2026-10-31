import {
  FeeBumpTransaction,
  type Horizon,
  Keypair,
  Networks,
  type Transaction,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { db } from "@bandcoin/db/server";
import { AppError, ErrorCodes } from "@bandcoin/errors";

import { createContext, type SessionUser } from "../src/context";
import { appRouter } from "../src/root-app";
import type { ChainGateway } from "../src/services/chain-gateway";
import { createCallerFactory } from "../src/trpc";

/**
 * The whole buy flow against the dev database, with a fake chain: quote,
 * start, cancel, submit, card, shortfall and a rejected submit. Fixture rows
 * are created here and removed afterwards.
 */

const host = new URL(process.env.DATABASE_URL ?? "postgresql://x@missing/x").hostname;
if (!host.startsWith("ep-shy-leaf-")) throw new Error(`Refusing to run against ${host}`);

const BANDCOIN = {
  code: "BANDCOIN",
  issuer: "GAPWBIC6RVQZCLBQ4GTZSI3I7YRYTSBC7EJ65KHHPL4T5CJECU3PQ7PD",
};
const USDC = { code: "USDC", issuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5" };
const run = `e2e${Date.now().toString(36)}`;
const keys = {
  artist: Keypair.random(),
  buyer: Keypair.random(),
  issuer: Keypair.random(),
  treasury: Keypair.random(),
};
const code = `E2E${Date.now().toString(36).slice(-5).toUpperCase()}`;

/** Spendable balances the fake Horizon reports per account. */
const wallets = new Map<
  string,
  { xlm: string; lines: { code: string; issuer: string; balance: string }[] }
>();
const submitted: string[] = [];
const charges: { orderId: string; cents: number }[] = [];
const refunds: string[] = [];
let failNextSubmit: AppError | null = null;

function fakeAccount(id: string): Horizon.AccountResponse | null {
  const wallet = wallets.get(id);
  if (!wallet) return null;
  return {
    accountId: () => id,
    sequenceNumber: () => "100",
    subentry_count: wallet.lines.length,
    balances: [
      { asset_type: "native", balance: wallet.xlm, selling_liabilities: "0" },
      ...wallet.lines.map((line) => ({
        asset_type: "credit_alphanum12",
        asset_code: line.code,
        asset_issuer: line.issuer,
        balance: line.balance,
        selling_liabilities: "0",
      })),
    ],
  } as unknown as Horizon.AccountResponse;
}

const chain: ChainGateway = {
  prepareContractCall: (xdr) => Promise.resolve(xdr),
  editionIdByRef: () => Promise.resolve(null),
  nftPurchaseByRef: () => Promise.resolve(null),
  assetTomlUrl: () => Promise.resolve(null),
  nftFeeSettings: () => Promise.resolve({ feeBps: 0, treasury: null, owner: null }),
  assetExists: () => Promise.resolve(true),
  contractIsLive: () => Promise.resolve(true),
  claimableFor: () => Promise.resolve([]),
  assetHolders: () => Promise.resolve({ holders: [], complete: true }),
  bandcoinUsd: () => Promise.resolve("0.002"),
  config: {
    name: "testnet",
    network: { passphrase: Networks.TESTNET, baseFee: "100" },
    horizonUrl: "",
    rpcUrl: "",
    assets: { bandcoin: BANDCOIN, usdc: USDC },
    treasury: keys.treasury.publicKey(),
    mother: null,
    nftContract: null,
    escrowContract: null,
  },
  loadAccount: async (id) => fakeAccount(id),
  rates: async () => ({ xlmUsd: "0.25", usdcUsd: "1" }),
  signWithServerKeys: vi.fn(async (xdr: string) => xdr),
  signForCustodialUser: vi.fn(async (xdr: string) => xdr),
  submit: async (xdr) => {
    if (failNextSubmit) {
      const error = failNextSubmit;
      failNextSubmit = null;
      throw error;
    }
    submitted.push(xdr);
    return {
      hash: Buffer.from(TransactionBuilder.fromXDR(xdr, Networks.TESTNET).hash()).toString("hex"),
    };
  },
  findTransaction: async () => null,
  card: {
    charge: async ({ orderId, cents }) => {
      charges.push({ orderId, cents });
      return { paymentId: `pay-${orderId}` };
    },
    refund: async ({ orderId }) => {
      refunds.push(orderId);
    },
  },
};

let buyer: SessionUser;
let listingId: string;
let itemId: string;
const ids = { users: [] as string[], chainAccount: "", artist: "" };

const callerFor = (user: SessionUser | null) =>
  createCallerFactory(appRouter)(
    createContext({ db, chain, app: "app", session: user ? { user } : null }),
  );

beforeAll(async () => {
  const artistUser = await db.user.create({
    data: { username: `${run}-artist`, role: "ARTIST", walletAddress: keys.artist.publicKey() },
  });
  const buyerUser = await db.user.create({
    data: {
      username: `${run}-buyer`,
      email: `${run}@demo.bandcoin.io`,
      walletAddress: keys.buyer.publicKey(),
    },
  });
  ids.users.push(artistUser.id, buyerUser.id);
  const issuer = await db.chainAccount.create({
    data: {
      kind: "ISSUER",
      publicKey: keys.issuer.publicKey(),
      secretEncrypted: "e2e:no-secret",
      ownerId: artistUser.id,
      activatedAt: new Date(),
    },
  });
  ids.chainAccount = issuer.id;
  const artist = await db.artist.create({
    data: {
      userId: artistUser.id,
      name: `E2E ${run}`,
      slug: run,
      status: "APPROVED",
      issuerAccountId: issuer.id,
    },
  });
  ids.artist = artist.id;
  const item = await db.item.create({
    data: {
      type: "TRACK",
      chainType: "CLASSIC_TOKEN",
      title: "E2E Track",
      slug: `${run}-track`,
      coverUrl: "https://picsum.photos/seed/e2e/400",
      supply: 5,
      artistId: artist.id,
      createdById: artistUser.id,
      classicToken: { create: { code, issuer: keys.issuer.publicKey() } },
    },
  });
  itemId = item.id;
  const listing = await db.listing.create({
    data: { itemId: item.id, sellerId: artistUser.id, priceBandcoin: "10", priceUsd: "2.5" },
  });
  listingId = listing.id;

  buyer = {
    id: buyerUser.id,
    role: "FAN",
    walletAddress: keys.buyer.publicKey(),
    walletType: "emailPass",
    email: buyerUser.email,
  };
  wallets.set(keys.buyer.publicKey(), { xlm: "10", lines: [{ ...BANDCOIN, balance: "100" }] });
  wallets.set(keys.artist.publicKey(), { xlm: "10", lines: [{ ...BANDCOIN, balance: "0" }] });
});

afterAll(async () => {
  await db.activityLog.deleteMany({ where: { actorId: { in: ids.users } } });
  await db.order.deleteMany({ where: { itemId } });
  await db.ownership.deleteMany({ where: { itemId } });
  await db.listing.deleteMany({ where: { itemId } });
  await db.item.deleteMany({ where: { id: itemId } });
  await db.artist.updateMany({ where: { id: ids.artist }, data: { fanTokenItemId: null } });
  await db.item.deleteMany({ where: { artistId: ids.artist } });
  await db.artist.deleteMany({ where: { id: ids.artist } });
  await db.chainAccount.deleteMany({ where: { id: ids.chainAccount } });
  await db.user.deleteMany({ where: { id: { in: ids.users } } });
  await db.$disconnect();
});

const purchase = (currency: "BANDCOIN" | "XLM" | "USDC" | "USD", quantity = 2) => ({
  listingId,
  quantity,
  currency,
});

describe("buying a classic token", () => {
  it("quotes all four currencies from the artist's two prices, without converting", async () => {
    const caller = callerFor(buyer);
    const bandcoin = await caller.order.quote(purchase("BANDCOIN"));
    expect(bandcoin.totals).toEqual([
      { currency: "BANDCOIN", amount: "20.5000000" },
      { currency: "XLM", amount: "0.5000400" },
    ]);
    expect(bandcoin.ok).toBe(true);

    const xlm = await caller.order.quote(purchase("XLM"));
    expect(xlm.totals).toEqual([{ currency: "XLM", amount: "21.0000400" }]);
    expect(xlm.ok).toBe(false); // 10 XLM in the wallet: short, and nothing is swapped to cover it
    expect(xlm.problems[0]).toMatchObject({ code: "INSUFFICIENT_FUNDS" });

    const usdc = await caller.order.quote(purchase("USDC"));
    expect(usdc.problems.map((problem) => problem.message)).toContain(
      "The seller can't receive USDC yet.",
    );

    // Card: $5 + 2.5 % + the 0.5 XLM reserve and 5-op fee bump at $0.25, all in USD
    const card = await caller.order.quote(purchase("USD"));
    expect(card.totals).toEqual([{ currency: "USD", amount: "5.2500125" }]);
    expect(card.cardSettlement).toMatchObject({ seller: "20.0000000", reserveXlm: "0.5000000" });
    expect(card.ok).toBe(true);

    expect((await callerFor(null).order.quote(purchase("BANDCOIN"))).problems[0]?.code).toBe(
      "SIGN_IN",
    );
  });

  it("lets a custodial buyer cancel during the countdown: nothing is signed or sent", async () => {
    const caller = callerFor(buyer);
    const started = await caller.order.start(purchase("BANDCOIN"));
    expect(started.signer).toBe("custodial");
    await caller.order.cancel({ orderId: started.orderId });

    await expect(
      caller.order.submit({ orderId: started.orderId, xdr: started.xdr }),
    ).rejects.toThrow(/canceled/);
    expect(chain.signForCustodialUser).not.toHaveBeenCalled();
    expect(submitted).toHaveLength(0);
  });

  it("delivers after the countdown: the buyer pays everything, the artist's issuer mints", async () => {
    const caller = callerFor(buyer);
    const started = await caller.order.start(purchase("BANDCOIN"));
    const tx = TransactionBuilder.fromXDR(started.xdr, Networks.TESTNET) as Transaction;
    expect(tx.source).toBe(keys.buyer.publicKey());

    const done = await caller.order.submit({ orderId: started.orderId, xdr: started.xdr });
    expect(done.status).toBe("DELIVERED");
    expect(chain.signWithServerKeys).toHaveBeenLastCalledWith(expect.any(String), [
      keys.issuer.publicKey(),
    ]);

    const order = await db.order.findUniqueOrThrow({ where: { id: started.orderId } });
    expect(order).toMatchObject({ status: "DELIVERED", method: "WALLET", currency: "BANDCOIN" });
    expect(order.total.toString()).toBe("20.5");
    expect(order.sellerAmount?.toString()).toBe("20");
    const owned = await db.ownership.findUniqueOrThrow({
      where: { userId_itemId: { userId: buyer.id, itemId } },
    });
    expect(owned.quantity.toString()).toBe("2");
    expect((await db.listing.findUniqueOrThrow({ where: { id: listingId } })).quantitySold).toBe(2);

    const log = await db.activityLog.findMany({
      where: { actorId: buyer.id, action: "order.submit" },
    });
    expect(log.at(-1)).toMatchObject({
      status: "SUCCESS",
      targetType: "Order",
      targetId: started.orderId,
      currency: "BANDCOIN",
    });
    expect(JSON.stringify(log.at(-1)?.input)).not.toContain(started.xdr.slice(0, 20));
  });

  it("refuses a transaction that isn't the one built for the order", async () => {
    const caller = callerFor(buyer);
    const first = await caller.order.start(purchase("BANDCOIN", 1));
    const second = await caller.order.start(purchase("BANDCOIN", 1));
    await expect(caller.order.submit({ orderId: first.orderId, xdr: second.xdr })).rejects.toThrow(
      /doesn't belong/,
    );
    await caller.order.cancel({ orderId: first.orderId });
    await caller.order.cancel({ orderId: second.orderId });
  });

  it("card: charges USD for everything, the treasury pays XLM and the seller in BANDCOIN", async () => {
    const caller = callerFor(buyer);
    const started = await caller.order.start(purchase("USD", 1));
    const tx = TransactionBuilder.fromXDR(started.xdr, Networks.TESTNET) as Transaction;
    expect(tx.source).toBe(keys.buyer.publicKey());
    const treasury = keys.treasury.publicKey();
    expect(tx.operations.map((op) => [op.type, op.source ?? "buyer"])).toEqual([
      ["payment", treasury], // 0.5 XLM for the trustline reserve
      ["changeTrust", "buyer"],
      ["payment", treasury], // the seller's 10 BANDCOIN
      ["payment", keys.issuer.publicKey()],
    ]);
    expect(tx.operations[2]).toMatchObject({
      destination: keys.artist.publicKey(),
      amount: "10.0000000",
    });

    const done = await caller.order.submit({
      orderId: started.orderId,
      xdr: started.xdr,
      card: { sourceId: "cnon:ok" },
    });
    expect(done.status).toBe("DELIVERED");
    // $2.50 + 2.5 % + 0.5 XLM + 0.00005 XLM at $0.25 = $2.6875125 → 269 ¢
    expect(charges.at(-1)).toEqual({ orderId: started.orderId, cents: 269 });
    const sent = TransactionBuilder.fromXDR(submitted.at(-1)!, Networks.TESTNET);
    expect(sent).toBeInstanceOf(FeeBumpTransaction);
    expect((sent as FeeBumpTransaction).feeSource).toBe(treasury);
    expect(Buffer.from((sent as FeeBumpTransaction).innerTransaction.hash()).toString("hex")).toBe(
      (await db.order.findUniqueOrThrow({ where: { id: started.orderId } })).txHash,
    );
  });

  it("refunds the card when Stellar rejects the delivery", async () => {
    const caller = callerFor(buyer);
    const started = await caller.order.start(purchase("USD", 1));
    failNextSubmit = new AppError(ErrorCodes.STELLAR_TRUSTLINE_MISSING);
    await expect(
      caller.order.submit({
        orderId: started.orderId,
        xdr: started.xdr,
        card: { sourceId: "cnon:ok" },
      }),
    ).rejects.toMatchObject({ message: expect.stringContaining("trustline") });
    const order = await db.order.findUniqueOrThrow({ where: { id: started.orderId } });
    expect(order).toMatchObject({ status: "REFUNDED", failureCode: "STELLAR_TRUSTLINE_MISSING" });
    expect(refunds).toContain(started.orderId);
  });

  it("won't start a purchase the buyer can't afford or that exceeds the supply", async () => {
    const caller = callerFor(buyer);
    await expect(caller.order.start(purchase("XLM"))).rejects.toThrow(/short/);
    await expect(caller.order.start(purchase("BANDCOIN", 4))).rejects.toThrow(/Only 2 left/);
  });
});

describe("a members-only or tier item", () => {
  const fanCode = `F${code.slice(1)}`;

  it("can be bought only by fans holding enough of the artist's fan token", async () => {
    const fanToken = await db.item.create({
      data: {
        type: "FAN_TOKEN",
        chainType: "CLASSIC_TOKEN",
        title: "E2E fan token",
        slug: `${run}-fan`,
        coverUrl: "https://picsum.photos/seed/e2e-fan/400",
        artistId: ids.artist,
        createdById: ids.users[0] ?? "",
        classicToken: { create: { code: fanCode, issuer: keys.issuer.publicKey() } },
      },
    });
    await db.artist.update({ where: { id: ids.artist }, data: { fanTokenItemId: fanToken.id } });
    const [low, gold] = await Promise.all([
      db.membershipTier.create({
        data: { artistId: ids.artist, name: "Fan", description: "", requiredTokens: "10" },
      }),
      db.membershipTier.create({
        data: { artistId: ids.artist, name: "Gold", description: "", requiredTokens: "50" },
      }),
    ]);
    const caller = callerFor(buyer);
    const holding = (balance: string) =>
      wallets.set(keys.buyer.publicKey(), {
        xlm: "10",
        lines: [
          { ...BANDCOIN, balance: "100" },
          { code: fanCode, issuer: keys.issuer.publicKey(), balance },
        ],
      });

    await db.item.update({ where: { id: itemId }, data: { tierId: gold.id } });
    holding("20");
    const short = await caller.order.quote(purchase("BANDCOIN", 1));
    expect(short.ok).toBe(false);
    expect(short.problems[0]?.message).toBe(`Hold 50 ${fanCode} to buy this. You have 20.`);
    const page = await caller.item.bySlug({ slug: `${run}-track` });
    expect(page.access).toMatchObject({
      kind: "TIER",
      tierName: "Gold",
      needed: "50",
      have: "20",
      ok: false,
    });
    await expect(caller.order.start(purchase("BANDCOIN", 1))).rejects.toThrow(/Hold 50/);

    holding("50");
    expect((await caller.order.quote(purchase("BANDCOIN", 1))).ok).toBe(true);

    // Members: the lowest tier counts.
    await db.item.update({ where: { id: itemId }, data: { tierId: null, membersOnly: true } });
    holding("10");
    expect((await caller.order.quote(purchase("BANDCOIN", 1))).ok).toBe(true);
    holding("9");
    expect((await caller.order.quote(purchase("BANDCOIN", 1))).problems[0]?.message).toMatch(
      /Hold 10/,
    );

    await db.item.update({ where: { id: itemId }, data: { membersOnly: false } });
    wallets.set(keys.buyer.publicKey(), { xlm: "10", lines: [{ ...BANDCOIN, balance: "100" }] });
    await db.membershipTier.deleteMany({ where: { id: { in: [low.id, gold.id] } } });
  });
});
