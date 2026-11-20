import { Account, Keypair, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { describe, expect, it, vi } from "vitest";

import type { Db, OrderKind } from "@actiontokens/db";

import type { ChainGateway } from "../services/chain-gateway";
import { finishOrder } from "../services/orders/finish";
import { reconcileOrders, settleOrder } from "../services/orders/reconcile";

vi.mock("../services/payments/square", () => ({ chargeCard: vi.fn(), refundCard: vi.fn() }));

const now = new Date("2026-10-31T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);
type Row = Record<string, unknown>;

/** A fake database with the real order rule: a status change only matches from allowed states. */
function setup(
  order: Row,
  opts: { found?: { successful: boolean } | null; edition?: number | null } = {},
) {
  const orders = new Map<string, Row>([[String(order.id), { status: "SUBMITTED", ...order }]]);
  const allowedFrom: Record<string, string[]> = {
    CONFIRMED: ["SUBMITTED"],
    DELIVERED: ["CONFIRMED"],
    FAILED: ["QUOTED", "AWAITING_SIGNATURE", "SUBMITTED", "CONFIRMED"],
    REFUNDED: ["DELIVERED", "FAILED"],
  };
  const issuerKey = Keypair.random().publicKey();
  const db = {
    order: {
      updateMany: vi.fn(
        ({ where, data }: { where: { id: string; status: { in: string[] } }; data: Row }) => {
          const row = orders.get(where.id);
          const to = String(data.status);
          if (!row || !(allowedFrom[to] ?? where.status.in).includes(String(row.status)))
            return Promise.resolve({ count: 0 });
          Object.assign(row, data);
          return Promise.resolve({ count: 1 });
        },
      ),
      findUnique: vi.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(orders.get(where.id) ?? null),
      ),
      findUniqueOrThrow: vi.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(orders.get(where.id)),
      ),
      findMany: vi.fn(() => Promise.resolve([...orders.values()])),
    },
    ownership: { upsert: vi.fn().mockResolvedValue({}) },
    listing: { update: vi.fn() },
    chainAccount: {
      findUnique: vi
        .fn()
        .mockResolvedValue({ id: "ca1", kind: "ISSUER", ownerId: "u1", publicKey: issuerKey }),
      update: vi.fn().mockResolvedValue({}),
    },
    artist: { update: vi.fn().mockResolvedValue({}) },
    contractNft: { update: vi.fn().mockResolvedValue({}) },
    vanityUrl: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn(),
    },
    activityLog: { create: vi.fn().mockResolvedValue({}) },
    $transaction: (run: (tx: unknown) => unknown) => run(db),
  };
  const envelope = new TransactionBuilder(new Account(Keypair.random().publicKey(), "1"), {
    fee: "100",
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(Operation.createAccount({ destination: issuerKey, startingBalance: "1.5" }))
    .setTimeout(60)
    .build()
    .toXDR();
  const chain = {
    config: { network: { passphrase: Networks.TESTNET } },
    findTransaction: vi
      .fn()
      .mockResolvedValue(
        opts.found === undefined
          ? { successful: true, envelopeXdr: envelope }
          : opts.found && { ...opts.found, envelopeXdr: envelope },
      ),
    editionIdByRef: vi.fn().mockResolvedValue(opts.edition === undefined ? 7 : opts.edition),
    card: { refund: vi.fn().mockResolvedValue({}) },
  };
  const activity = { set: vi.fn(), facts: () => ({}) };
  return {
    ctx: { db: db as unknown as Db, chain: chain as unknown as ChainGateway, activity },
    db,
    chain,
    orders,
    envelope,
  };
}

const order = (kind: OrderKind, extra: Row = {}) =>
  ({
    id: "o1",
    kind,
    txHash: "hash",
    cardPaymentId: null,
    total: { toString: () => "5" },
    quoteExpiresAt: ago(5 * 60_000),
    updatedAt: ago(5 * 60_000),
    buyerId: "u1",
    itemId: null,
    listingId: null,
    quantity: 1,
    breakdown: { giftDetails: { recipientId: "u2", itemId: "i1", amount: 1 }, itemId: "i9" },
    ...extra,
  }) as never;

describe("finishing an order", () => {
  const kinds: OrderKind[] = [
    "ITEM_PURCHASE",
    "RECHARGE",
    "ACTIVATION",
    "GIFT",
    "STORAGE_STOCK",
    "STORAGE_WITHDRAW",
    "ISSUER_SETUP",
    "NFT_REGISTER",
  ];

  it.each(kinds)("%s: delivers once; a second finish does nothing", async (kind) => {
    const { ctx, db, orders, envelope } = setup(order(kind, { itemId: "i1" }));
    await expect(finishOrder(ctx, { id: "o1", kind }, envelope)).resolves.toMatchObject({
      status: "DELIVERED",
    });
    expect(orders.get("o1")?.status).toBe("DELIVERED");
    const sideEffects = () =>
      db.ownership.upsert.mock.calls.length +
      db.artist.update.mock.calls.length +
      db.contractNft.update.mock.calls.length;
    const before = sideEffects();
    await expect(finishOrder(ctx, { id: "o1", kind }, envelope)).rejects.toMatchObject({
      code: "RESOURCE_CONFLICT",
    });
    expect(sideEffects()).toBe(before);
  });

  it("gives a gift to its recipient, and links an opened account to the artist", async () => {
    const gift = setup(order("GIFT"));
    await finishOrder(gift.ctx, { id: "o1", kind: "GIFT" }, gift.envelope);
    expect(gift.db.ownership.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_itemId: { userId: "u2", itemId: "i1" } },
        create: expect.objectContaining({ source: "GIFT" }) as unknown,
      }),
    );
    const issuer = setup(order("ISSUER_SETUP"));
    await finishOrder(issuer.ctx, { id: "o1", kind: "ISSUER_SETUP" }, issuer.envelope);
    expect(issuer.db.artist.update).toHaveBeenCalledWith({
      where: { userId: "u1" },
      data: { issuerAccountId: "ca1" },
    });
  });

  it("leaves an NFT registration waiting while the contract hasn't answered", async () => {
    const { ctx, orders, envelope } = setup(order("NFT_REGISTER"), { edition: null });
    await expect(
      finishOrder(ctx, { id: "o1", kind: "NFT_REGISTER" }, envelope),
    ).resolves.toMatchObject({
      status: "SUBMITTED",
    });
    expect(orders.get("o1")?.status).toBe("SUBMITTED");
  });
});

describe("settling a stuck order", () => {
  it("finishes one that landed", async () => {
    const { ctx, orders } = setup(order("ITEM_PURCHASE"));
    await expect(settleOrder(ctx, order("ITEM_PURCHASE"), now)).resolves.toBe("DELIVERED");
    expect(orders.get("o1")?.status).toBe("DELIVERED");
  });

  it("counts it delivered when the app finished it in the meantime", async () => {
    const { ctx, orders } = setup(order("ITEM_PURCHASE"));
    orders.get("o1")!.status = "DELIVERED";
    await expect(settleOrder(ctx, order("ITEM_PURCHASE"), now)).resolves.toBe("DELIVERED");
  });

  it("fails one Stellar rejected, and refunds its card", async () => {
    const { ctx, chain, orders } = setup(order("ITEM_PURCHASE", { cardPaymentId: "sq1" }), {
      found: { successful: false },
    });
    await expect(
      settleOrder(ctx, order("ITEM_PURCHASE", { cardPaymentId: "sq1" }), now),
    ).resolves.toBe("FAILED");
    expect(chain.card.refund).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: "o1", paymentId: "sq1" }),
    );
    expect(orders.get("o1")).toMatchObject({
      status: "REFUNDED",
      failureCode: "STELLAR_TX_REJECTED",
    });
  });

  it("waits for one not seen yet, and fails it once it's past its time limit", async () => {
    const recent = order("ITEM_PURCHASE", { quoteExpiresAt: ago(60_000) });
    const waiting = setup(recent, { found: null });
    await expect(settleOrder(waiting.ctx, recent, now)).resolves.toBe("WAITING");
    expect(waiting.orders.get("o1")?.status).toBe("SUBMITTED");

    const old = order("ITEM_PURCHASE", { quoteExpiresAt: ago(11 * 60_000) });
    const lost = setup(old, { found: null });
    await expect(settleOrder(lost.ctx, old, now)).resolves.toBe("FAILED");
    expect(lost.orders.get("o1")).toMatchObject({
      status: "FAILED",
      failureCode: "STELLAR_TX_SUBMIT_FAILED",
    });
  });
});

describe("reconcileOrders", () => {
  it("only looks at orders sent over a minute ago, and logs each change on the buyer's timeline", async () => {
    const { ctx, db } = setup(order("ITEM_PURCHASE"));
    await expect(reconcileOrders(ctx, now)).resolves.toMatchObject({ looked: 1, DELIVERED: 1 });
    expect(db.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: "SUBMITTED", updatedAt: { lt: ago(60_000) } },
      }),
    );
    expect(db.activityLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: "u1",
        actorRole: "SYSTEM",
        action: "order.reconcile",
        targetId: "o1",
        app: "worker",
      }) as unknown,
    });
  });

  it("keeps going when one order can't be settled", async () => {
    const { ctx, chain } = setup(order("ITEM_PURCHASE"));
    chain.findTransaction.mockRejectedValueOnce(new Error("horizon down"));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(reconcileOrders(ctx, now)).resolves.toMatchObject({ ERROR: 1 });
    error.mockRestore();
  });
});
