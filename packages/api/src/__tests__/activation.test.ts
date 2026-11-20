import {
  Account,
  Keypair,
  Networks,
  type Transaction,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { describe, expect, it, vi } from "vitest";

import type { Db } from "@actiontokens/db";

import { createContext, type SessionUser } from "../context";
import { appRouter } from "../root-app";
import type { ChainGateway } from "../services/chain-gateway";
import {
  quoteActivation,
  startActivation,
  submitActivation,
} from "../services/recharge/activation";
import { createCallerFactory } from "../trpc";

const mother = Keypair.random().publicKey();
const fan = Keypair.random().publicKey();
const network = { passphrase: Networks.TESTNET, baseFee: "100" };
const ORDER = "cmvorder0000000000000002";
const me: SessionUser = { id: "me", role: "FAN", walletAddress: fan, walletType: "freighter" };

function setup(
  opts: {
    fanExists?: boolean;
    motherKey?: string | null;
    submit?: (xdr: string) => Promise<{ hash: string }>;
  } = {},
) {
  const orders = new Map<string, Record<string, unknown>>();
  const db = {
    order: {
      create: vi.fn(({ data }: { data: Record<string, unknown> }) => {
        const row = { id: ORDER, status: "QUOTED", buyerId: "me", ...data };
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
        ({
          where,
          data,
        }: {
          where: { id: string; status: { in: string[] } };
          data: Record<string, unknown>;
        }) => {
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
  const fanAccount = Object.assign(new Account(fan, "5"), {
    subentry_count: 0,
    balances: [{ asset_type: "native", balance: "5", selling_liabilities: "0" }],
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
      mother: opts.motherKey === undefined ? mother : opts.motherKey,
    },
    loadAccount: vi.fn((id: string) =>
      Promise.resolve(
        id === mother ? new Account(mother, "41") : opts.fanExists ? fanAccount : null,
      ),
    ),
    rates: vi.fn().mockResolvedValue({ xlmUsd: "0.1", usdcUsd: "1" }),
    bandcoinUsd: vi.fn().mockResolvedValue("0.002"),
    signWithServerKeys: vi.fn((xdr: string) => Promise.resolve(xdr)),
    submit: vi.fn(opts.submit ?? ((_xdr: string) => Promise.resolve({ hash: "txhash" }))),
    card: {
      charge: vi.fn().mockResolvedValue({ paymentId: "pay1" }),
      refund: vi.fn().mockResolvedValue(undefined),
    },
  };
  const activity = { set: vi.fn(), facts: () => ({}) };
  return {
    ctx: { db: db as unknown as Db, chain: chain as unknown as ChainGateway, activity },
    db,
    chain,
    orders,
  };
}

describe("quoteActivation", () => {
  it("prices the card payment for a wallet that doesn't exist yet", async () => {
    await expect(quoteActivation(setup().ctx, me)).resolves.toMatchObject({
      ok: true,
      chargeCents: 199,
    });
  });

  it("refuses a wallet that is already active, and a missing mother key", async () => {
    await expect(quoteActivation(setup({ fanExists: true }).ctx, me)).resolves.toMatchObject({
      ok: false,
      problems: [{ code: "UNAVAILABLE", message: "Your wallet is already active." }],
    });
    await expect(quoteActivation(setup({ motherKey: null }).ctx, me)).resolves.toMatchObject({
      ok: false,
      problems: [{ code: "UNAVAILABLE", message: "Activation isn't available right now." }],
    });
  });
});

describe("activation", () => {
  it("creates a card order and nothing else yet: no transaction, no charge", async () => {
    const { ctx, chain, orders } = setup();
    await expect(startActivation(ctx, me)).resolves.toMatchObject({ orderId: ORDER });
    expect(orders.get(ORDER)).toMatchObject({
      kind: "ACTIVATION",
      method: "CARD",
      currency: "USD",
      status: "AWAITING_SIGNATURE",
    });
    expect(chain.card.charge).not.toHaveBeenCalled();
    expect(chain.submit).not.toHaveBeenCalled();
  });

  it("charges the card, then the platform creates the account in a transaction it signs and sends", async () => {
    const { ctx, chain, orders } = setup();
    await startActivation(ctx, me);
    await expect(
      submitActivation(ctx, me, { orderId: ORDER, card: { sourceId: "cnon:card" } }),
    ).resolves.toEqual({ orderId: ORDER, status: "DELIVERED" });

    expect(chain.card.charge).toHaveBeenCalledWith({
      orderId: ORDER,
      sourceId: "cnon:card",
      cents: 199,
      verificationToken: undefined,
    });
    expect(chain.signWithServerKeys).toHaveBeenCalledWith(expect.any(String), [mother]);
    const sent = TransactionBuilder.fromXDR(
      chain.submit.mock.calls[0]![0],
      Networks.TESTNET,
    ) as Transaction;
    expect(sent.source).toBe(mother);
    expect(sent.operations[0]).toMatchObject({
      type: "createAccount",
      destination: fan,
      startingBalance: "19.8999900",
    });
    expect(orders.get(ORDER)).toMatchObject({
      status: "DELIVERED",
      cardPaymentId: "pay1",
      txHash: expect.any(String) as string,
    });
  });

  it("needs a card, and won't charge if the wallet came alive in the meantime", async () => {
    const { ctx, chain } = setup();
    await startActivation(ctx, me);
    await expect(submitActivation(ctx, me, { orderId: ORDER })).rejects.toMatchObject({
      message: "Add a card to pay.",
    });

    chain.loadAccount.mockImplementation((id: string) =>
      Promise.resolve(id === mother ? new Account(mother, "41") : new Account(fan, "1")),
    );
    await expect(
      submitActivation(ctx, me, { orderId: ORDER, card: { sourceId: "c" } }),
    ).rejects.toMatchObject({ message: "Your wallet is already active." });
    expect(chain.card.charge).not.toHaveBeenCalled();
  });

  it("refunds the card when the network rejects the transaction", async () => {
    const { ctx, chain, orders } = setup({ submit: () => Promise.reject(new Error("tx_failed")) });
    await startActivation(ctx, me);
    await expect(
      submitActivation(ctx, me, { orderId: ORDER, card: { sourceId: "c" } }),
    ).rejects.toThrow("tx_failed");
    expect(chain.card.refund).toHaveBeenCalledWith({
      orderId: ORDER,
      paymentId: "pay1",
      cents: 199,
    });
    expect(orders.get(ORDER)).toMatchObject({ status: "REFUNDED" });
  });

  it("won't take someone else's order or a recharge order", async () => {
    const { ctx, orders } = setup();
    await startActivation(ctx, me);
    await expect(
      submitActivation(ctx, { ...me, id: "other" }, { orderId: ORDER, card: { sourceId: "c" } }),
    ).rejects.toMatchObject({ message: "Order not found" });
    orders.get(ORDER)!.kind = "RECHARGE";
    await expect(
      submitActivation(ctx, me, { orderId: ORDER, card: { sourceId: "c" } }),
    ).rejects.toMatchObject({ message: "Order not found" });
  });
});

describe("activation router", () => {
  it("is open for a quote but needs a signed-in fan to start or pay", async () => {
    const { chain } = setup();
    const caller = (user: SessionUser | null) =>
      createCallerFactory(appRouter)(
        createContext({
          db: { activityLog: { create: vi.fn() } } as unknown as Db,
          chain: chain as unknown as ChainGateway,
          app: "app",
          session: user ? { user } : null,
        }),
      );
    await expect(caller(null).activation.start()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      caller(null).activation.submit({ orderId: "o", card: { sourceId: "c" } }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
