import { Account, Keypair, Networks } from "@stellar/stellar-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@actiontokens/db";
import { AppError, ErrorCodes } from "@actiontokens/errors";

const mocks = vi.hoisted(() => ({
  lookup: vi.fn(),
  priceSale: vi.fn(),
  priceNft: vi.fn(),
  isNftListing: vi.fn(),
  loadNftSale: vi.fn(),
  loadSale: vi.fn(),
  ensureRegistered: vi.fn(),
  buildItemTransaction: vi.fn(),
  cosignPurchase: vi.fn(),
  deliverOrder: vi.fn(),
  buildNftTopUp: vi.fn(),
  runCardNftSteps: vi.fn(),
}));

vi.mock("@actiontokens/auth/email-lookup", () => ({ lookupAccountForEmail: mocks.lookup }));
vi.mock("../services/purchase/sale", () => ({ loadSale: mocks.loadSale }));
vi.mock("../services/purchase/nft", () => ({
  buildNftTopUp: mocks.buildNftTopUp,
  ensureRegistered: mocks.ensureRegistered,
  isNftListing: mocks.isNftListing,
  loadNftSale: mocks.loadNftSale,
  priceNft: mocks.priceNft,
  runCardNftSteps: mocks.runCardNftSteps,
}));
vi.mock("../services/purchase/index", async (importActual) => ({
  ...(await importActual<typeof import("../services/purchase/index")>()),
  priceSale: mocks.priceSale,
  buildItemTransaction: mocks.buildItemTransaction,
  cosignPurchase: mocks.cosignPurchase,
  deliverOrder: mocks.deliverOrder,
}));

import {
  payGuestPurchase,
  quoteGuestPurchase,
  startGuestPurchase,
} from "../services/purchase/guest";
import type { ChainGateway } from "../services/chain-gateway";

const network = { passphrase: Networks.TESTNET, baseFee: "100" };
const mother = Keypair.random();
const wallet = Keypair.random().publicKey();
const ORDER = "cmvguest000000000000001";
const ask = { listingId: "l1", quantity: 1, email: " Fan@Example.com " };

type Row = Record<string, unknown>;

const itemQuote = (problems: { code: string; message: string }[] = []) => ({
  currency: "USD",
  quantity: 1,
  unitPrice: "5",
  rateUsd: "1",
  lines: [{ key: "price", label: "Item price", amount: "5.0000000", currency: "USD" }],
  totals: [{ currency: "USD", amount: "5.0000000" }],
  payout: { seller: "40.0000000", royalty: "0.0000000", platform: "1.0000000" },
  cardSettlement: null,
  ok: problems.length === 0,
  problems,
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
});

function setup(opts: { open?: boolean; submit?: (xdr: string) => Promise<{ hash: string }> } = {}) {
  const orders = new Map<string, Row>();
  let opened = opts.open ?? false;
  const db = {
    order: {
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn(({ data }: { data: Row }) => {
        const row = { id: ORDER, status: "QUOTED", ...data };
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
        return Promise.resolve(orders.get(where.id));
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
    activityLog: { count: vi.fn().mockResolvedValue(0) },
    appSetting: { findUnique: vi.fn().mockResolvedValue(null) },
  };
  const buyer = Object.assign(new Account(wallet, "3"), { balances: [] });
  const platform = Object.assign(new Account(mother.publicKey(), "8"), { balances: [] });
  const submitted: string[] = [];
  const chain = {
    config: {
      network,
      mother: mother.publicKey(),
      treasury: Keypair.random().publicKey(),
      assets: {},
    },
    rates: vi.fn().mockResolvedValue({ xlmUsd: "0.25", usdcUsd: "1" }),
    loadAccount: vi.fn((id: string) =>
      Promise.resolve(
        id === mother.publicKey() ? platform : id === wallet && opened ? buyer : null,
      ),
    ),
    accountForEmail: vi.fn().mockResolvedValue({
      userId: "u-new",
      walletAddress: wallet,
      custodial: true,
      created: true,
    }),
    signWithServerKeys: vi.fn((xdr: string) => Promise.resolve(xdr)),
    signForCustodialUser: vi.fn((xdr: string) => Promise.resolve(`${xdr}+fan`)),
    submit: vi.fn((xdr: string) => {
      submitted.push(xdr);
      // The first transaction for a closed account opens it.
      opened = true;
      return (opts.submit ?? (() => Promise.resolve({ hash: "h" })))(xdr);
    }),
    card: {
      charge: vi.fn().mockResolvedValue({ paymentId: "sq1" }),
      refund: vi.fn().mockResolvedValue(undefined),
    },
  };
  const ctx = {
    db: db as unknown as Db,
    chain: chain as unknown as ChainGateway,
    activity: { set: vi.fn(), facts: () => ({}) },
    ip: "1.2.3.4",
  };
  return { ctx, db, chain, orders, submitted };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.lookup.mockResolvedValue(null);
  mocks.isNftListing.mockResolvedValue(false);
  mocks.loadSale.mockResolvedValue({ item: { id: "item1" } });
  mocks.priceSale.mockImplementation(() =>
    Promise.resolve({
      quote: { ...itemQuote(), problems: [{ code: "SIGN_IN", message: "Sign in to pay." }] },
      sale: { item: { id: "item1" } },
      delivery: {},
      openTrustline: true,
      feeRecipient: "x",
    }),
  );
  mocks.buildItemTransaction.mockReturnValue({ xdr: "purchase-xdr", hash: "purchase-hash" });
  mocks.cosignPurchase.mockImplementation((_ctx, xdr: string) =>
    Promise.resolve(`${xdr}+platform`),
  );
  mocks.deliverOrder.mockResolvedValue({ orderId: ORDER, status: "DELIVERED" });
});

const card = { sourceId: "cnon:1" };
async function started(over: Parameters<typeof setup>[0] = {}) {
  const env = setup(over);
  await startGuestPurchase(env.ctx, ask);
  return env;
}

describe("guest quote", () => {
  it("adds opening the account for a new email, and doesn't ask to sign in", async () => {
    const { ctx } = setup();
    const quote = await quoteGuestPurchase(ctx, ask);
    expect(quote.ok).toBe(true);
    expect(quote.lines.map((line) => [line.key, line.amount])).toEqual([
      ["price", "5.0000000"],
      ["account", "1.9900000"],
    ]);
    expect(quote.totals).toEqual([{ currency: "USD", amount: "6.9900000" }]);
    expect(mocks.lookup).toHaveBeenCalledWith(expect.anything(), "fan@example.com");
  });

  it("charges nothing for an account that's already open", async () => {
    mocks.lookup.mockResolvedValue({ userId: "u1", walletAddress: wallet, custodial: true });
    const quote = await quoteGuestPurchase(setup({ open: true }).ctx, ask);
    expect(quote.lines.map((line) => line.key)).toEqual(["price"]);
    expect(quote.totals[0]!.amount).toBe("5.0000000");
  });

  it("sends a wallet account's email to sign in instead", async () => {
    mocks.lookup.mockResolvedValue({ userId: "u1", walletAddress: wallet, custodial: false });
    const quote = await quoteGuestPurchase(setup({ open: true }).ctx, ask);
    expect(quote.ok).toBe(false);
    expect(quote.problems[0]!.message).toMatch(/wallet account/);
  });
});

describe("guest start", () => {
  it("makes the order with the email and no buyer or transaction yet", async () => {
    const { orders } = await started();
    expect(orders.get(ORDER)).toMatchObject({
      kind: "ITEM_PURCHASE",
      guestEmail: "fan@example.com",
      method: "CARD",
      currency: "USD",
      total: "6.9900000",
      status: "AWAITING_SIGNATURE",
      breakdown: expect.objectContaining({
        itemUsd: "5.0000000",
        guest: expect.objectContaining({ accountUsd: "1.9900000" }),
      }),
    });
    expect(orders.get(ORDER)!.buyerId).toBeUndefined();
  });

  it("stops after too many checkouts from one email or address in an hour", async () => {
    const { ctx, db } = setup();
    db.order.count.mockResolvedValue(5);
    await expect(startGuestPurchase(ctx, ask)).rejects.toMatchObject({
      code: ErrorCodes.RATE_LIMITED,
    });
    db.order.count.mockResolvedValue(0);
    db.activityLog.count.mockResolvedValue(10);
    await expect(startGuestPurchase(ctx, ask)).rejects.toMatchObject({
      code: ErrorCodes.RATE_LIMITED,
    });
    expect(db.order.create).not.toHaveBeenCalled();
  });
});

describe("guest pay", () => {
  it("charges, makes the account, opens it, then buys and delivers", async () => {
    const { ctx, chain, orders, submitted } = await started();
    await expect(
      payGuestPurchase(ctx, { orderId: ORDER, email: "FAN@example.com", card }),
    ).resolves.toEqual({ orderId: ORDER, status: "DELIVERED" });
    expect(chain.card.charge).toHaveBeenCalledWith(expect.objectContaining({ cents: 699 }));
    expect(chain.accountForEmail).toHaveBeenCalledWith("fan@example.com");
    // Opening first (the mother account signs), then the purchase the fan's key signs.
    expect(submitted).toHaveLength(2);
    expect(submitted[1]).toBe("purchase-xdr+fan+platform");
    expect(orders.get(ORDER)).toMatchObject({
      buyerId: "u-new",
      cardPaymentId: "sq1",
      txHash: "purchase-hash",
      breakdown: expect.objectContaining({
        guest: expect.objectContaining({ openingSettled: true }),
      }),
    });
    expect(chain.card.refund).not.toHaveBeenCalled();
  });

  it("refunds only the item when the purchase fails after the account opened", async () => {
    let calls = 0;
    const { ctx, chain, orders } = await started({
      submit: () =>
        ++calls === 1
          ? Promise.resolve({ hash: "open" })
          : Promise.reject(new AppError(ErrorCodes.STELLAR_TX_REJECTED)),
    });
    await expect(payGuestPurchase(ctx, { orderId: ORDER, email: ask.email, card })).rejects.toThrow(
      AppError,
    );
    expect(chain.card.refund).toHaveBeenCalledTimes(1);
    expect(chain.card.refund).toHaveBeenCalledWith(expect.objectContaining({ cents: 500 }));
    expect(orders.get(ORDER)!.status).toBe("REFUNDED");
  });

  it("refunds everything when the account can't be made", async () => {
    const { ctx, chain, orders } = await started();
    chain.accountForEmail.mockRejectedValue(new Error("accounts service down"));
    await expect(payGuestPurchase(ctx, { orderId: ORDER, email: ask.email, card })).rejects.toThrow(
      "accounts service down",
    );
    expect(chain.card.refund).toHaveBeenCalledWith(expect.objectContaining({ cents: 699 }));
    expect(chain.submit).not.toHaveBeenCalled();
    expect(orders.get(ORDER)!.status).toBe("REFUNDED");
  });

  it("refunds everything when the email turns out to be a wallet account", async () => {
    const { ctx, chain } = await started();
    chain.accountForEmail.mockResolvedValue({
      userId: "u2",
      walletAddress: wallet,
      custodial: false,
      created: false,
    });
    await expect(payGuestPurchase(ctx, { orderId: ORDER, email: ask.email, card })).rejects.toThrow(
      /wallet account/,
    );
    expect(chain.card.refund).toHaveBeenCalledWith(expect.objectContaining({ cents: 699 }));
  });

  it("refunds the opening part once, when the account was open already", async () => {
    const env = await started();
    // Opened elsewhere between the quote and the payment.
    env.chain.loadAccount.mockImplementation((id: string) =>
      Promise.resolve(
        id === wallet ? Object.assign(new Account(wallet, "3"), { balances: [] }) : null,
      ),
    );
    env.chain.submit.mockRejectedValueOnce(new AppError(ErrorCodes.STELLAR_TX_REJECTED));
    await expect(
      payGuestPurchase(env.ctx, { orderId: ORDER, email: ask.email, card }),
    ).rejects.toThrow(AppError);
    // 1.99 USD back for the opening, then 5 USD for the failed item: never the whole 6.99 again.
    expect(
      env.chain.card.refund.mock.calls.map(([call]) => (call as { cents: number }).cents),
    ).toEqual([199, 500]);
  });

  it("can't be paid twice, or by another email", async () => {
    const { ctx, chain } = await started();
    await expect(
      payGuestPurchase(ctx, { orderId: ORDER, email: "someone@else.com", card }),
    ).rejects.toMatchObject({ message: "Order not found" });
    await payGuestPurchase(ctx, { orderId: ORDER, email: ask.email, card });
    await expect(
      payGuestPurchase(ctx, { orderId: ORDER, email: ask.email, card }),
    ).rejects.toMatchObject({ code: ErrorCodes.RESOURCE_CONFLICT });
    expect(chain.card.charge).toHaveBeenCalledTimes(1);
  });

  it("buys a contract NFT through the card steps, signed for the fan", async () => {
    mocks.isNftListing.mockResolvedValue(true);
    mocks.loadNftSale.mockResolvedValue({ item: { id: "nft1" } });
    mocks.priceNft.mockResolvedValue({
      quote: itemQuote(),
      price: { actionToken: 500_000_000n, usd: 50_000_000n },
      feeActionToken: 0n,
      buyFeeXlm: 600_000n,
      openTrustline: true,
      reserveXlm: 5_000_000n,
      actionToken: {},
    });
    mocks.buildNftTopUp.mockReturnValue({ xdr: "topup-xdr", hash: "topup-hash" });
    mocks.runCardNftSteps.mockResolvedValue({ orderId: ORDER, status: "DELIVERED" });
    const { ctx, orders } = await started();
    expect(orders.get(ORDER)).toMatchObject({ kind: "NFT_PURCHASE", itemId: "nft1" });
    expect(mocks.ensureRegistered).toHaveBeenCalled();
    await payGuestPurchase(ctx, { orderId: ORDER, email: ask.email, card });
    expect(mocks.runCardNftSteps).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ id: ORDER }),
      "topup-xdr+fan",
      "sq1",
      { email: "fan@example.com", walletAddress: wallet },
    );
  });
});
