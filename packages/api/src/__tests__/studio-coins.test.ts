import { describe, expect, it, vi } from "vitest";

import type { SessionUser } from "../context";
import { holdCoins, settleHold } from "../services/studio/balance";
import { quoteTopUp, startTopUp, submitTopUp } from "../services/studio/topup";

const user: SessionUser = {
  id: "u1",
  role: "FAN",
  walletAddress: "GBUYER",
  walletType: "freighter",
};

function setup(over: { order?: Record<string, unknown>; deliverFails?: boolean } = {}) {
  const ledger: Record<string, unknown>[] = [];
  const order = {
    id: "o1",
    kind: "STUDIO_COINS",
    buyerId: "u1",
    status: "AWAITING_SIGNATURE",
    method: "CARD",
    currency: "USD",
    total: { toString: () => "9.00" },
    txHash: null,
    quoteExpiresAt: new Date(Date.now() + 60_000),
    breakdown: {
      studio: { coins: 900, bonusCoins: 100, usd: "9.00", packageId: "p1", label: "Creator" },
    },
    ...over.order,
  };
  const tx = {
    order: {
      findUnique: vi.fn().mockResolvedValue(order),
      findUniqueOrThrow: vi.fn().mockResolvedValue(order),
      update: vi.fn().mockResolvedValue(order),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    studioLedgerEntry: {
      create: vi.fn((args: { data: Record<string, unknown> }) => {
        if (over.deliverFails) return Promise.reject(new Error("db down"));
        ledger.push(args.data);
        return Promise.resolve({ id: "l1" });
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: vi
        .fn()
        .mockResolvedValue({ userId: "u1", amount: -6, generationId: "g1" }),
    },
    studioBalance: {
      upsert: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    studioPackage: {
      findFirst: vi
        .fn()
        .mockResolvedValue({ id: "p1", name: "Creator", priceUsd: "9", bonusCoins: "100" }),
    },
  };
  const db = {
    ...tx,
    order: { ...tx.order, create: vi.fn().mockResolvedValue({ id: "o1" }) },
    $transaction: vi.fn((run: (client: unknown) => unknown) => run(tx)),
  };
  const chain = {
    config: {
      network: { baseFee: 100, passphrase: "Test SDF Network ; September 2015" },
      assets: {},
      treasury: "GTREASURY",
    },
    loadAccount: vi.fn().mockResolvedValue(null),
    rates: vi.fn().mockResolvedValue({ xlmUsd: "0.25", usdcUsd: "1" }),
    bandcoinUsd: vi.fn().mockResolvedValue("0.0001"),
    card: {
      charge: vi.fn().mockResolvedValue({ paymentId: "sq1" }),
      refund: vi.fn().mockResolvedValue({}),
    },
  };
  const ctx = { db, chain, activity: { set: vi.fn(), facts: vi.fn() } } as never;
  return { ctx, db, tx, chain, ledger };
}

describe("Studio top-ups", () => {
  it("prices a package by its dollars (one coin a cent) plus its bonus", async () => {
    const { ctx } = setup();
    const quote = await quoteTopUp(ctx, user, { currency: "USD", packageId: "p1" });
    expect(quote).toMatchObject({
      coins: 900,
      bonusCoins: 100,
      usd: "9.00",
      pay: "9.00",
      currency: "USD",
      ok: true,
    });
  });

  it("takes any amount from $1 to $500", async () => {
    const { ctx } = setup();
    expect(await quoteTopUp(ctx, user, { currency: "USD", usd: 2.5 })).toMatchObject({
      coins: 250,
      bonusCoins: 0,
    });
    await expect(quoteTopUp(ctx, user, { currency: "USD", usd: 0.5 })).rejects.toThrow(
      /between \$1 and \$500/,
    );
    await expect(quoteTopUp(ctx, user, { currency: "USD", usd: 900 })).rejects.toThrow(
      /between \$1 and \$500/,
    );
  });

  it("asks for a wallet's first XLM before a BANDCOIN payment, priced at the live rate", async () => {
    const { ctx } = setup();
    const quote = await quoteTopUp(ctx, user, { currency: "BANDCOIN", usd: 2 });
    expect(quote.pay).toBe("20000.0000000");
    expect(quote.rateUsd).toBe("0.0001");
    expect(quote.ok).toBe(false);
    expect(quote.problems[0]?.message).toMatch(/first XLM/);
  });

  it("starts a card order with nothing to sign", async () => {
    const { ctx, db } = setup();
    const started = await startTopUp(ctx, user, { currency: "USD", packageId: "p1" });
    expect(started).toMatchObject({ orderId: "o1", xdr: null, signer: "card" });
    expect(db.order.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ kind: "STUDIO_COINS", method: "CARD", currency: "USD" }),
    });
  });

  it("charges the card, then adds the coins and the bonus", async () => {
    const { ctx, chain, ledger, tx } = setup();
    const done = await submitTopUp(ctx, user, { orderId: "o1", card: { sourceId: "cnon:ok" } });
    expect(done).toEqual({ orderId: "o1", status: "DELIVERED", coins: 1000 });
    expect(chain.card.charge).toHaveBeenCalledWith(expect.objectContaining({ cents: 900 }));
    expect(ledger).toEqual([
      expect.objectContaining({ kind: "DEPOSIT", amount: 900, status: "CONFIRMED" }),
      expect.objectContaining({ kind: "BONUS", amount: 100 }),
    ]);
    expect(tx.studioBalance.upsert).toHaveBeenCalledTimes(2);
  });

  it("refunds the card when the coins couldn't be added", async () => {
    const { ctx, chain } = setup({ deliverFails: true });
    await expect(
      submitTopUp(ctx, user, { orderId: "o1", card: { sourceId: "cnon:ok" } }),
    ).rejects.toThrow("db down");
    expect(chain.card.refund).toHaveBeenCalledWith(
      expect.objectContaining({ paymentId: "sq1", cents: 900 }),
    );
  });

  it("refuses an order that's no longer waiting, without charging", async () => {
    const { ctx, chain } = setup({ order: { status: "DELIVERED" } });
    await expect(
      submitTopUp(ctx, user, { orderId: "o1", card: { sourceId: "cnon:ok" } }),
    ).rejects.toThrow(/already delivered/);
    expect(chain.card.charge).not.toHaveBeenCalled();
  });
});

describe("holding coins for a run", () => {
  it("refuses when the balance doesn't cover the price", async () => {
    const { ctx, tx } = setup();
    tx.studioBalance.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      holdCoins(ctx, { userId: "u1", generationId: "g1", coins: 6, note: "Image" }),
    ).rejects.toThrow(/needs 6 coins/);
    expect(tx.studioLedgerEntry.create).not.toHaveBeenCalled();
  });

  it("holds the coins as a pending spend", async () => {
    const { ctx, ledger } = setup();
    await holdCoins(ctx, { userId: "u1", generationId: "g1", coins: 6, note: "Image" });
    expect(ledger).toEqual([
      expect.objectContaining({ kind: "SPEND", status: "PENDING", amount: -6 }),
    ]);
  });

  it("gives the coins back once when a run fails", async () => {
    const { ctx, tx, ledger } = setup();
    expect(await settleHold(ctx, { entryId: "l1", outcome: "REFUND" })).toEqual({ settled: true });
    expect(ledger).toEqual([expect.objectContaining({ kind: "REFUND", amount: 6 })]);
    expect(tx.studioBalance.update).toHaveBeenCalledWith({
      where: { userId: "u1" },
      data: { balance: { increment: 6 } },
    });
    tx.studioLedgerEntry.updateMany.mockResolvedValue({ count: 0 });
    expect(await settleHold(ctx, { entryId: "l1", outcome: "REFUND" })).toEqual({ settled: false });
  });
});
