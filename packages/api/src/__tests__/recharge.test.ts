import {
  Account,
  FeeBumpTransaction,
  Keypair,
  Networks,
  type Transaction,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { describe, expect, it, vi } from "vitest";

import type { Db } from "@bandcoin/db";

import { createContext, type SessionUser } from "../context";
import { appRouter } from "../root-app";
import type { ChainGateway } from "../services/chain-gateway";
import { quoteRecharge, startRecharge, submitRecharge } from "../services/recharge";
import { createCallerFactory } from "../trpc";

const mother = Keypair.random().publicKey();
const fan = Keypair.random().publicKey();
const issuer = Keypair.random().publicKey();
const network = { passphrase: Networks.TESTNET, baseFee: "100" };
const ORDER = "cmvorder0000000000000001";

const me: SessionUser = { id: "me", role: "FAN", walletAddress: fan, walletType: "freighter" };
const custodial: SessionUser = { ...me, walletType: "emailPass", email: "fan@example.com" };

function horizonAccount({ xlm = "10", bandcoin }: { xlm?: string; bandcoin?: string } = {}) {
  return Object.assign(new Account(fan, "100"), {
    subentry_count: bandcoin === undefined ? 0 : 1,
    balances: [
      { asset_type: "native", balance: xlm, selling_liabilities: "0" },
      ...(bandcoin === undefined
        ? []
        : [
            {
              asset_type: "credit_alphanum12",
              asset_code: "BANDCOIN",
              asset_issuer: issuer,
              balance: bandcoin,
            },
          ]),
    ],
  });
}

function setup(
  opts: {
    account?: ReturnType<typeof horizonAccount> | null;
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
  const chain = {
    config: {
      name: "testnet",
      network,
      assets: {
        bandcoin: { code: "BANDCOIN", issuer },
        usdc: { code: "USDC", issuer: Keypair.random().publicKey() },
      },
      treasury: Keypair.random().publicKey(),
      mother: opts.motherKey === undefined ? mother : opts.motherKey,
    },
    loadAccount: vi
      .fn()
      .mockResolvedValue(
        opts.account === undefined ? horizonAccount({ bandcoin: "0" }) : opts.account,
      ),
    rates: vi.fn().mockResolvedValue({ xlmUsd: "0.1", usdcUsd: "1" }),
    bandcoinUsd: vi.fn().mockResolvedValue("0.002"),
    signWithServerKeys: vi.fn((xdr: string) => Promise.resolve(xdr)),
    signForCustodialUser: vi.fn((xdr: string) => Promise.resolve(xdr)),
    submit: vi.fn(opts.submit ?? ((_xdr: string) => Promise.resolve({ hash: "txhash" }))),
    card: {
      charge: vi.fn().mockResolvedValue({ paymentId: "pay1" }),
      refund: vi.fn().mockResolvedValue(undefined),
    },
  };
  const activity = { set: vi.fn(), facts: () => ({}) };
  const ctx = { db: db as unknown as Db, chain: chain as unknown as ChainGateway, activity };
  return { ctx, db, chain, orders };
}

const topUp = { kind: "TOP_UP" as const, packageUsd: "9.99" };
const swap = { kind: "XLM_SWAP" as const };
const parse = (xdr: string) => TransactionBuilder.fromXDR(xdr, Networks.TESTNET);

describe("quoteRecharge", () => {
  it("prices a top-up and says the BANDCOIN line is new when the wallet has none", async () => {
    const { ctx } = setup({ account: horizonAccount() });
    const quote = await quoteRecharge(ctx, me, topUp);
    expect(quote).toMatchObject({ ok: true, chargeCents: 999 });
    expect(quote.lines.map((line) => line.key)).toContain("reserve");
  });

  it("refuses a wallet that doesn't exist on the network yet, and a missing mother key", async () => {
    await expect(quoteRecharge(setup({ account: null }).ctx, me, topUp)).resolves.toMatchObject({
      ok: false,
      problems: [
        {
          code: "UNAVAILABLE",
          message: "Your wallet needs its first XLM before it can be recharged.",
        },
      ],
    });
    await expect(quoteRecharge(setup({ motherKey: null }).ctx, me, topUp)).resolves.toMatchObject({
      ok: false,
      problems: [{ code: "UNAVAILABLE", message: "Recharge isn't available right now." }],
    });
  });

  it("tells the swap how much BANDCOIN is short, and never swaps for it", async () => {
    const { ctx, chain } = setup({ account: horizonAccount({ bandcoin: "20" }) });
    const quote = await quoteRecharge(ctx, me, swap);
    expect(quote.problems).toMatchObject([
      { code: "INSUFFICIENT_FUNDS", shortfall: { short: "31" } },
    ]);
    expect(chain.submit).not.toHaveBeenCalled();
  });
});

describe("top-up", () => {
  it("creates a card order and a transaction where the platform sends the BANDCOIN", async () => {
    const { ctx, orders } = setup({ account: horizonAccount({ bandcoin: "0" }) });
    const started = await startRecharge(ctx, me, topUp);
    expect(started).toMatchObject({ orderId: ORDER, signer: "wallet" });
    expect(orders.get(ORDER)).toMatchObject({
      kind: "RECHARGE",
      method: "CARD",
      currency: "USD",
      status: "AWAITING_SIGNATURE",
      buyerId: "me",
    });
    const tx = parse(started.xdr) as Transaction;
    expect(tx.operations.map((op) => op.type)).toEqual(["payment"]);
    expect(tx.operations[0]).toMatchObject({ source: mother, destination: fan });
  });

  it("charges the card, has the platform co-sign and pay the fee, then delivers", async () => {
    const { ctx, chain, orders } = setup();
    const { xdr } = await startRecharge(ctx, me, topUp);
    await expect(
      submitRecharge(ctx, me, { orderId: ORDER, xdr, card: { sourceId: "cnon:card" } }),
    ).resolves.toEqual({ orderId: ORDER, status: "DELIVERED" });

    expect(chain.card.charge).toHaveBeenCalledWith({
      orderId: ORDER,
      sourceId: "cnon:card",
      cents: 999,
      verificationToken: undefined,
    });
    expect(chain.signWithServerKeys).toHaveBeenCalledTimes(2);
    expect(chain.signWithServerKeys).toHaveBeenNthCalledWith(1, xdr, [mother]);
    const submitted = parse(chain.submit.mock.calls[0]![0]);
    expect(submitted).toBeInstanceOf(FeeBumpTransaction);
    expect((submitted as FeeBumpTransaction).feeSource).toBe(mother);
    expect(orders.get(ORDER)).toMatchObject({ status: "DELIVERED", cardPaymentId: "pay1" });
  });

  it("needs a card, and a transaction that belongs to the order", async () => {
    const { ctx, chain } = setup();
    const { xdr } = await startRecharge(ctx, me, topUp);
    await expect(submitRecharge(ctx, me, { orderId: ORDER, xdr })).rejects.toMatchObject({
      message: "Add a card to pay.",
    });
    const other = await startRecharge(setup().ctx, me, { kind: "TOP_UP", packageUsd: "4.99" });
    await expect(
      submitRecharge(ctx, me, { orderId: ORDER, xdr: other.xdr, card: { sourceId: "c" } }),
    ).rejects.toMatchObject({
      message: "That transaction doesn't belong to this order.",
    });
    expect(chain.card.charge).not.toHaveBeenCalled();
  });

  it("refunds the card when the transaction is rejected", async () => {
    const { ctx, chain, orders } = setup({ submit: () => Promise.reject(new Error("tx_failed")) });
    const { xdr } = await startRecharge(ctx, me, topUp);
    await expect(
      submitRecharge(ctx, me, { orderId: ORDER, xdr, card: { sourceId: "c" } }),
    ).rejects.toThrow("tx_failed");
    expect(chain.card.refund).toHaveBeenCalledWith({
      orderId: ORDER,
      paymentId: "pay1",
      cents: 999,
    });
    expect(orders.get(ORDER)).toMatchObject({ status: "REFUNDED" });
  });

  it("gives custodial users the countdown flow and signs for them only on submit", async () => {
    const { ctx, chain } = setup();
    const started = await startRecharge(ctx, custodial, topUp);
    expect(started.signer).toBe("custodial");
    expect(chain.signForCustodialUser).not.toHaveBeenCalled();
    await submitRecharge(ctx, custodial, {
      orderId: ORDER,
      xdr: started.xdr,
      card: { sourceId: "c" },
    });
    expect(chain.signForCustodialUser).toHaveBeenCalledWith(started.xdr, "fan@example.com");
  });
});

describe("XLM swap", () => {
  it("won't start without enough BANDCOIN", async () => {
    const { ctx, orders } = setup({ account: horizonAccount({ bandcoin: "20" }) });
    await expect(startRecharge(ctx, me, swap)).rejects.toMatchObject({
      message: "You need 31 more BANDCOIN.",
    });
    expect(orders.size).toBe(0);
  });

  it("pays BANDCOIN and receives 1 XLM in one transaction, with no card involved", async () => {
    const { ctx, chain, orders } = setup({ account: horizonAccount({ bandcoin: "500" }) });
    const started = await startRecharge(ctx, me, swap);
    expect(orders.get(ORDER)).toMatchObject({
      kind: "XLM_SWAP",
      method: "WALLET",
      currency: "BANDCOIN",
      total: "51.0000000",
    });
    await expect(
      submitRecharge(ctx, me, { orderId: ORDER, xdr: started.xdr }),
    ).resolves.toMatchObject({ status: "DELIVERED" });
    expect(chain.card.charge).not.toHaveBeenCalled();
    expect(parse(chain.submit.mock.calls[0]![0])).not.toBeInstanceOf(FeeBumpTransaction);
  });
});

describe("recharge router", () => {
  const callerFor = (user: SessionUser | null, db: object = {}) => {
    const { chain } = setup();
    const full = { ...db, activityLog: { create: vi.fn().mockResolvedValue({}) } } as unknown as Db;
    return createCallerFactory(appRouter)(
      createContext({
        db: full,
        chain: chain as unknown as ChainGateway,
        app: "app",
        session: user ? { user } : null,
      }),
    );
  };

  it("lists the card packages and the swap for the page", async () => {
    await expect(callerFor(null).recharge.options()).resolves.toEqual({
      packagesUsd: ["1.99", "4.99", "9.99", "19.99", "24.99", "49.99", "99.99"],
      xlmSwap: { xlm: "1", marginBps: 200 },
    });
  });

  it("only takes the listed packages, and needs a signed-in fan to start", async () => {
    await expect(
      callerFor(me).recharge.quote({ kind: "TOP_UP", packageUsd: "9.98" as never }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(callerFor(null).recharge.start({ kind: "XLM_SWAP" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(callerFor(null).recharge.submit({ orderId: "o", xdr: "x" })).rejects.toMatchObject(
      { code: "UNAUTHORIZED" },
    );
  });
});
