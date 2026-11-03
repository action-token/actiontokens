import {
  Account,
  Keypair,
  Networks,
  type Transaction,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { describe, expect, it, vi } from "vitest";

import type { Db } from "@bandcoin/db";

import type { SessionUser } from "../context";
import type { ChainGateway } from "../services/chain-gateway";
import { settleOrder } from "../services/orders/reconcile";
import { quoteNftPurchase, startNftPurchase, submitNftPurchase } from "../services/purchase/nft";

const network = { passphrase: Networks.TESTNET, baseFee: "100" };
const contract = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
const fan = Keypair.random().publicKey();
const treasury = Keypair.random().publicKey();
const creator = Keypair.random().publicKey();
const bandcoin = { code: "BANDCOIN", issuer: Keypair.random().publicKey() };
const usdc = { code: "USDC", issuer: Keypair.random().publicKey() };

const wallet: SessionUser = { id: "fan", role: "FAN", walletAddress: fan, walletType: "freighter" };
const custodial: SessionUser = { ...wallet, walletType: "emailPass", email: "fan@example.com" };

type Row = Record<string, unknown>;

function horizon(
  id: string,
  { xlm = "5", bandcoin: held }: { xlm?: string; bandcoin?: string } = {},
) {
  return Object.assign(new Account(id, "100"), {
    subentry_count: held === undefined ? 0 : 1,
    balances: [
      { asset_type: "native", balance: xlm, selling_liabilities: "0" },
      ...(held === undefined
        ? []
        : [
            {
              asset_type: "credit_alphanum12",
              asset_code: bandcoin.code,
              asset_issuer: bandcoin.issuer,
              balance: held,
              selling_liabilities: "0",
            },
          ]),
    ],
  });
}

function setup(
  opts: {
    held?: string;
    buyer?: ReturnType<typeof horizon> | null;
    registered?: boolean;
    receipt?: boolean;
    /** The artist's wallet isn't on Stellar */
    creatorMissing?: boolean;
    prepareFee?: string;
    submit?: (xdr: string, call: number) => Promise<{ hash: string }>;
  } = {},
) {
  const orders = new Map<string, Row>();
  const editions: Row[] = [];
  const listing = {
    id: "l1",
    kind: "PRIMARY",
    status: "ACTIVE",
    sellerId: "artist-user",
    quantity: null,
    quantitySold: 3,
    priceBandcoin: { toString: () => "25" },
    priceUsd: { toString: () => "2" },
    item: {
      id: "i1",
      chainType: "CONTRACT_NFT",
      title: "VIP pass",
      description: "Backstage",
      coverUrl: "https://cdn.example/c.jpg",
      supply: 50,
      deletedAt: null,
      hiddenAt: null,
      membersOnly: false,
      tier: null,
      artist: { tiers: [], fanTokenItem: null, user: { walletAddress: creator } },
      media: null,
      contractNft: {
        onChainEditionId: opts.registered === false ? null : "7",
        status: opts.registered === false ? "PENDING" : "MINTED",
        royaltyBps: 500,
      },
    },
  };
  const db = {
    listing: {
      findUnique: vi.fn().mockResolvedValue(listing),
      update: vi.fn().mockResolvedValue({ ...listing, quantitySold: 4, item: { supply: 50 } }),
    },
    appSetting: { findUnique: vi.fn().mockResolvedValue({ platformFeeBps: 250 }) },
    contractNft: { update: vi.fn().mockResolvedValue({}) },
    order: {
      create: vi.fn(({ data }: { data: Row }) => {
        const row = { id: "order1", status: "QUOTED", ...data };
        orders.set("order1", row);
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
    nftEdition: {
      findMany: vi.fn(() =>
        Promise.resolve(editions.map((row, index) => ({ id: `e${index}`, ownerId: row.ownerId }))),
      ),
      createMany: vi.fn(({ data }: { data: Row[] }) => {
        editions.push(...data);
        return Promise.resolve({ count: data.length });
      }),
    },
    ownership: { upsert: vi.fn().mockResolvedValue({}) },
    item: {
      findUnique: vi.fn().mockResolvedValue({ title: "VIP pass", coverUrl: null, artistId: "a1" }),
    },
    lockedContent: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "lc1",
          label: "Backstage",
          unlockRule: { radiusMeters: 50, points: [{ latitude: 1, longitude: 2 }] },
        },
      ]),
    },
    pin: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: "pin" }),
    },
    $transaction: (run: (tx: unknown) => unknown) => run(db),
  };
  let calls = 0;
  let registered = opts.registered !== false;
  const chain = {
    config: {
      name: "testnet",
      network,
      assets: { bandcoin, usdc },
      treasury,
      nftContract: contract,
    },
    loadAccount: vi.fn((id: string) =>
      Promise.resolve(
        id === fan
          ? opts.buyer === undefined
            ? horizon(fan, { bandcoin: opts.held ?? "100" })
            : opts.buyer
          : id === creator && opts.creatorMissing
            ? null
            : horizon(id),
      ),
    ),
    rates: vi.fn().mockResolvedValue({ xlmUsd: "0.1", usdcUsd: "1" }),
    bandcoinUsd: vi.fn().mockResolvedValue("0.01"),
    prepareContractCall: vi.fn((xdr: string) => {
      if (!opts.prepareFee) return Promise.resolve(xdr);
      const tx = TransactionBuilder.fromXDR(xdr, network.passphrase) as Transaction;
      return Promise.resolve(
        TransactionBuilder.cloneFrom(tx, { fee: opts.prepareFee }).build().toXDR(),
      );
    }),
    signWithServerKeys: vi.fn((xdr: string) => Promise.resolve(xdr)),
    signForCustodialUser: vi.fn((xdr: string) => Promise.resolve(xdr)),
    editionIdByRef: vi.fn(() => Promise.resolve(registered ? 7 : null)),
    nftPurchaseByRef: vi.fn(() =>
      Promise.resolve(
        opts.receipt === false
          ? null
          : { editionId: 7, buyer: fan, firstTokenId: 40, lastTokenId: 41, quantity: 2 },
      ),
    ),
    submit: vi.fn(async (xdr: string) => {
      calls += 1;
      const result = await (opts.submit ?? (() => Promise.resolve({ hash: `tx${calls}` })))(
        xdr,
        calls,
      );
      registered = true;
      return result;
    }),
    findTransaction: vi.fn(),
    card: {
      charge: vi.fn().mockResolvedValue({ paymentId: "sq1" }),
      refund: vi.fn().mockResolvedValue(undefined),
    },
  };
  const activity = { set: vi.fn(), facts: () => ({}) };
  return {
    ctx: { db: db as unknown as Db, chain: chain as unknown as ChainGateway, activity },
    db,
    chain,
    orders,
    editions,
  };
}

const buy: { listingId: string; quantity: number; currency: "BANDCOIN" | "USD" } = {
  listingId: "l1",
  quantity: 2,
  currency: "BANDCOIN",
};
const opsOf = (xdr: string) =>
  (TransactionBuilder.fromXDR(xdr, network.passphrase) as Transaction).operations;

describe("contract NFT quote", () => {
  it("prices it in BANDCOIN with the network fee in BANDCOIN, and no platform fee for the fan", async () => {
    const { ctx } = setup();
    const quote = await quoteNftPurchase(ctx, wallet, buy);
    // 2 copies: 0.05 + 2 × 0.01 = 0.07 XLM ≈ $0.007 = 0.7 BANDCOIN
    expect(quote.lines.map((line) => [line.key, line.amount, line.currency])).toEqual([
      ["price", "50.0000000", "BANDCOIN"],
      ["networkFee", "0.7000000", "BANDCOIN"],
    ]);
    expect(quote.totals).toEqual([{ currency: "BANDCOIN", amount: "50.7000000" }]);
    expect(quote.payout).toMatchObject({ seller: "48.7500000", platform: "1.2500000" });
    expect(quote.ok).toBe(true);
  });

  it("says what's in the way", async () => {
    const codes = async (user: SessionUser | null, input = buy, over = {}) =>
      (await quoteNftPurchase(setup(over).ctx, user, input)).problems.map((p) => p.message);
    expect(await codes(wallet, buy, { held: "10" })).toEqual(["You're 40.7 BANDCOIN short."]);
    expect(await codes(wallet, { ...buy, currency: "XLM" as never })).toContain(
      "Contract NFTs are paid in BANDCOIN or by card.",
    );
    expect(await codes(wallet, { ...buy, quantity: 21 })).toContain(
      "Up to 20 copies in one purchase.",
    );
    expect(await codes(wallet, { ...buy, currency: "USD" })).toContain(
      "Card works for email, Google and Apple accounts. Pay with BANDCOIN from your wallet.",
    );
    expect(await codes(null)).toEqual(["Sign in to pay."]);
  });

  it("says only that the artist isn't set up when their wallet isn't on Stellar", async () => {
    const quote = await quoteNftPurchase(
      setup({ creatorMissing: true, held: "10" }).ctx,
      wallet,
      buy,
    );
    expect(quote.problems).toEqual([
      { code: "NOT_SET_UP", message: "This artist hasn't finished setting up sales yet." },
    ]);
    expect(quote.ok).toBe(false);
  });

  it("lets the artist buy their own NFT (to gift a copy)", async () => {
    const quote = await quoteNftPurchase(setup().ctx, { ...wallet, id: "artist-user" }, buy);
    expect(quote.problems).toEqual([]);
    expect(quote.ok).toBe(true);
  });

  it("charges a card the USD price plus the XLM costs in dollars, with the trustline when needed", async () => {
    const quote = await quoteNftPurchase(setup({ buyer: horizon(fan) }).ctx, custodial, {
      ...buy,
      currency: "USD",
    });
    expect(quote.lines.map((line) => [line.key, line.amount])).toEqual([
      ["price", "4.0000000"],
      ["reserve", "0.0500000"],
      ["networkFee", "0.0070040"],
    ]);
    expect(quote.ok).toBe(true);
  });
});

describe("buying with BANDCOIN from a wallet", () => {
  it("registers the edition at its first sale, as the platform", async () => {
    const { ctx, chain, db } = setup({ registered: false });
    await startNftPurchase(ctx, wallet, buy);
    const registration = chain.submit.mock.calls[0]![0];
    expect(opsOf(registration)[0]).toMatchObject({ type: "invokeHostFunction" });
    expect(chain.signWithServerKeys).toHaveBeenCalledWith(registration, [treasury]);
    expect(db.contractNft.update).toHaveBeenCalledWith({
      where: { itemId: "i1" },
      data: { onChainEditionId: "7", status: "MINTED" },
    });
  });

  it("builds buy_edition from the fan's wallet, the order id as the purchase ref, nothing sent", async () => {
    const { ctx, chain, orders } = setup();
    const started = await startNftPurchase(ctx, wallet, buy);
    expect(started.signer).toBe("wallet");
    const tx = TransactionBuilder.fromXDR(started.xdr, network.passphrase) as Transaction;
    expect(tx.source).toBe(fan);
    expect(tx.operations[0]).toMatchObject({ type: "invokeHostFunction" });
    expect(chain.prepareContractCall).toHaveBeenCalledWith(expect.any(String), [treasury]);
    expect(chain.submit).not.toHaveBeenCalled();
    expect(orders.get("order1")).toMatchObject({
      kind: "NFT_PURCHASE",
      status: "AWAITING_SIGNATURE",
      method: "WALLET",
      total: "50.7000000",
    });
  });

  it("stops before anything is sent when the real fee is above what was shown", async () => {
    const { ctx, chain, orders } = setup({ prepareFee: "2000000" });
    await expect(startNftPurchase(ctx, wallet, buy)).rejects.toMatchObject({
      message:
        "The network fee is higher than shown right now. Nothing was charged; try again in a minute.",
    });
    expect(orders.get("order1")).toMatchObject({ status: "FAILED" });
    expect(chain.submit).not.toHaveBeenCalled();
  });

  it("fee-bumps the signed buy with the treasury, then records each minted copy", async () => {
    const { ctx, chain, db, editions, orders } = setup();
    const { orderId, xdr } = await startNftPurchase(ctx, wallet, buy);
    await expect(submitNftPurchase(ctx, wallet, { orderId, xdr })).resolves.toEqual({
      orderId,
      status: "DELIVERED",
    });
    const sent = chain.submit.mock.calls[0]![0];
    expect(TransactionBuilder.fromXDR(sent, network.passphrase)).toHaveProperty("innerTransaction");
    expect(editions).toEqual([
      { itemId: "i1", tokenId: "40", ownerId: "fan" },
      { itemId: "i1", tokenId: "41", ownerId: "fan" },
    ]);
    expect(db.ownership.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ quantity: 2 }) }),
    );
    expect(orders.get(orderId)).toMatchObject({ status: "DELIVERED" });
    // Each new copy gets its own places to visit, only for its owner.
    expect(db.pin.create).toHaveBeenCalledTimes(2);
    expect(db.pin.create.mock.calls[0]![0]).toMatchObject({
      data: { restrictedToUserId: "fan", unlockEditionId: "e0", unlockLockedContentId: "lc1" },
    });
  });
});

describe("buying by card", () => {
  it("sends the BANDCOIN first, then buys, after charging the card", async () => {
    const { ctx, chain, orders } = setup({ buyer: horizon(fan, { bandcoin: "0" }) });
    const { orderId, xdr, signer } = await startNftPurchase(ctx, custodial, {
      ...buy,
      currency: "USD",
    });
    expect(signer).toBe("custodial");
    expect(opsOf(xdr).map((op) => op.type)).toEqual(["payment"]);
    await submitNftPurchase(ctx, custodial, { orderId, xdr, card: { sourceId: "cnon:1" } });
    expect(chain.card.charge).toHaveBeenCalledWith(
      expect.objectContaining({ cents: Math.ceil(Number(orders.get(orderId)!.total) * 100) }),
    );
    const [topUp, buyTx] = chain.submit.mock.calls.map(([sent]) => sent);
    expect(
      (
        TransactionBuilder.fromXDR(topUp!, network.passphrase) as unknown as {
          innerTransaction: Transaction;
        }
      ).innerTransaction.operations[0],
    ).toMatchObject({ type: "payment", source: treasury, destination: fan, amount: "50.0000000" });
    expect(
      (
        TransactionBuilder.fromXDR(buyTx!, network.passphrase) as unknown as {
          innerTransaction: Transaction;
        }
      ).innerTransaction.operations[0],
    ).toMatchObject({ type: "invokeHostFunction" });
    expect(orders.get(orderId)).toMatchObject({ status: "DELIVERED", cardPaymentId: "sq1" });
  });

  it("refunds the card when the BANDCOIN can't go in", async () => {
    const { ctx, chain, orders } = setup({
      buyer: horizon(fan, { bandcoin: "0" }),
      submit: () => Promise.reject(new Error("tx_failed")),
    });
    const { orderId, xdr } = await startNftPurchase(ctx, custodial, { ...buy, currency: "USD" });
    await expect(
      submitNftPurchase(ctx, custodial, { orderId, xdr, card: { sourceId: "cnon:1" } }),
    ).rejects.toThrow();
    expect(chain.card.refund).toHaveBeenCalled();
    expect(orders.get(orderId)).toMatchObject({ status: "REFUNDED" });
  });

  it("keeps the BANDCOIN with the fan when the buy fails, without a refund or a retry", async () => {
    const { ctx, chain, orders } = setup({
      buyer: horizon(fan, { bandcoin: "0" }),
      submit: (_xdr, call) =>
        call === 1 ? Promise.resolve({ hash: "topup" }) : Promise.reject(new Error("tx_failed")),
    });
    const { orderId, xdr } = await startNftPurchase(ctx, custodial, { ...buy, currency: "USD" });
    await expect(
      submitNftPurchase(ctx, custodial, { orderId, xdr, card: { sourceId: "cnon:1" } }),
    ).rejects.toMatchObject({
      message:
        "Your card payment became 50 BANDCOIN in your wallet, but the NFT couldn't be bought. Nothing else was charged; you can buy it with that BANDCOIN.",
    });
    expect(chain.submit).toHaveBeenCalledTimes(2);
    expect(chain.card.refund).not.toHaveBeenCalled();
    expect(orders.get(orderId)).toMatchObject({
      status: "FAILED",
      failureCode: "NFT_BUY_FAILED_FUNDED",
    });
  });
});

describe("settling a stuck NFT order", () => {
  const stuck = (over: Row = {}) => ({
    id: "order1",
    kind: "NFT_PURCHASE" as const,
    txHash: "abc",
    cardPaymentId: null,
    total: { toString: () => "50.7" },
    quoteExpiresAt: new Date("2026-10-31T10:00:00Z"),
    updatedAt: new Date("2026-10-31T10:00:00Z"),
    ...over,
  });

  it("delivers from the contract's receipt, whatever the transaction lookup says", async () => {
    const { ctx, chain, orders } = setup();
    orders.set("order1", {
      id: "order1",
      status: "SUBMITTED",
      buyerId: "fan",
      itemId: "i1",
      listingId: "l1",
    });
    chain.findTransaction.mockResolvedValue(null);
    await expect(
      settleOrder(ctx, stuck() as never, new Date("2026-10-31T10:30:00Z")),
    ).resolves.toBe("DELIVERED");
  });

  it("fails a card order whose BANDCOIN went in but never bought, without refunding", async () => {
    const { ctx, chain, orders } = setup({ receipt: false });
    orders.set("order1", { id: "order1", status: "SUBMITTED" });
    chain.findTransaction.mockResolvedValue({ successful: true, envelopeXdr: "" });
    const order = stuck({ cardPaymentId: "sq1" });
    await expect(settleOrder(ctx, order as never, new Date("2026-10-31T10:01:00Z"))).resolves.toBe(
      "WAITING",
    );
    await expect(settleOrder(ctx, order as never, new Date("2026-10-31T10:30:00Z"))).resolves.toBe(
      "FAILED",
    );
    expect(orders.get("order1")).toMatchObject({ failureCode: "NFT_BUY_FAILED_FUNDED" });
    expect(chain.card.refund).not.toHaveBeenCalled();
  });
});
