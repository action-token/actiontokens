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

const tokenIssuer = Keypair.random().publicKey();
const usdcIssuer = Keypair.random().publicKey();

function horizonAccount({
  xlm = "10",
  bandcoin,
  novaLine = false,
  usdc,
}: { xlm?: string; bandcoin?: string; novaLine?: boolean; usdc?: string } = {}) {
  return Object.assign(new Account(fan, "100"), {
    subentry_count: bandcoin === undefined ? 0 : 1,
    balances: [
      { asset_type: "native", balance: xlm, selling_liabilities: "0" },
      ...(novaLine
        ? [
            {
              asset_type: "credit_alphanum4",
              asset_code: "NOVA",
              asset_issuer: tokenIssuer,
              balance: "0",
            },
          ]
        : []),
      ...(usdc === undefined
        ? []
        : [
            {
              asset_type: "credit_alphanum4",
              asset_code: "USDC",
              asset_issuer: usdcIssuer,
              balance: usdc,
            },
          ]),
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
    token?: { code: string; issuer: string } | null;
    submit?: (xdr: string) => Promise<{ hash: string }>;
  } = {},
) {
  const orders = new Map<string, Record<string, unknown>>();
  const token = opts.token === undefined ? { code: "NOVA", issuer: tokenIssuer } : opts.token;
  const db = {
    artist: {
      findFirst: vi.fn().mockResolvedValue({
        name: "Nova",
        fanTokenItem: token ? { classicToken: token } : null,
      }),
    },
    follow: { upsert: vi.fn().mockResolvedValue({}) },
    appSetting: { findUnique: vi.fn().mockResolvedValue({ platformFeeBps: 250 }) },
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
        usdc: { code: "USDC", issuer: usdcIssuer },
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

const topUp = { kind: "TOP_UP", packageUsd: "9.99" } as const;
const trust = { kind: "TOKEN_TRUST" as const, artistId: "a1", currency: "BANDCOIN" as const };
const trustIn = (currency: "BANDCOIN" | "USDC" | "XLM" | "USD") => ({ ...trust, currency });
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

describe("holding an artist's fan token", () => {
  it("prices the 0.5 XLM the line locks, at today's rate plus the cushion and the fee", async () => {
    const { ctx } = setup({ account: horizonAccount({ bandcoin: "500" }) });
    const quote = await quoteRecharge(ctx, me, trust);
    // 0.5 XLM × $0.10 ÷ $0.002 = 25, + 2% = 25.5, + 2.5% fee = 26.1375
    expect(quote).toMatchObject({
      ok: true,
      kind: "TOKEN_TRUST",
      token: { code: "NOVA", artistName: "Nova" },
      sendXlm: "0.5",
      platformPays: "25.5000000",
      fee: "0.6375000",
      total: "26.1375000",
    });
  });

  it("says no when the artist has no token, the fan already holds it, or BANDCOIN is short", async () => {
    const none = await quoteRecharge(
      setup({ account: horizonAccount({ bandcoin: "500" }), token: null }).ctx,
      me,
      trust,
    );
    expect(none.problems[0]).toMatchObject({ message: "This artist has no fan token to hold." });
    const held = await quoteRecharge(
      setup({ account: horizonAccount({ bandcoin: "500", novaLine: true }) }).ctx,
      me,
      trust,
    );
    expect(held.problems[0]).toMatchObject({ message: "You already hold NOVA." });
    const short = await quoteRecharge(
      setup({ account: horizonAccount({ bandcoin: "5" }) }).ctx,
      me,
      trust,
    );
    expect(short.problems[0]).toMatchObject({ code: "INSUFFICIENT_FUNDS" });
  });

  it("pays BANDCOIN, receives exactly the reserve, and opens the line, all in one transaction", async () => {
    const { ctx, chain, orders, db } = setup({ account: horizonAccount({ bandcoin: "500" }) });
    const started = await startRecharge(ctx, me, trust);
    expect(orders.get(ORDER)).toMatchObject({
      kind: "TOKEN_TRUST",
      method: "WALLET",
      currency: "BANDCOIN",
      total: "26.1375000",
      platformFee: "0.6375000",
    });
    const tx = parse(started.xdr) as Transaction;
    expect(tx.operations.map((op) => op.type)).toEqual([
      "payment",
      "payment",
      "payment",
      "changeTrust",
    ]);
    expect(tx.operations[0]).toMatchObject({ destination: mother, amount: "25.5000000" });
    expect(tx.operations[1]).toMatchObject({
      destination: ctx.chain.config.treasury,
      amount: "0.6375000",
    });
    expect(tx.operations[2]).toMatchObject({
      source: mother,
      destination: fan,
      amount: "0.5000000",
    });
    await expect(
      submitRecharge(ctx, me, { orderId: ORDER, xdr: started.xdr }),
    ).resolves.toMatchObject({ status: "DELIVERED" });
    expect(chain.card.charge).not.toHaveBeenCalled();
    // Trusting the token makes the fan a subscriber of that artist (and a follower).
    expect(db.follow.upsert).toHaveBeenCalledWith({
      where: { userId_artistId: { userId: "me", artistId: "a1" } },
      create: { userId: "me", artistId: "a1", isTemporary: false },
      update: { isTemporary: false },
    });
  });

  it("won't start for a line the fan already holds, and creates no order", async () => {
    const { ctx, orders } = setup({ account: horizonAccount({ bandcoin: "500", novaLine: true }) });
    await expect(startRecharge(ctx, me, trust)).rejects.toMatchObject({
      message: "You already hold NOVA.",
    });
    expect(orders.size).toBe(0);
  });
});

describe("subscribing in USDC, XLM or by card (plan 33)", () => {
  it("USDC pays the platform for the XLM and the fee to the treasury", async () => {
    const env = setup({ account: horizonAccount({ bandcoin: "0", usdc: "5" }) });
    const started = await startRecharge(env.ctx, me, trustIn("USDC"));
    // $0.05 of XLM + 2% = 0.051 USDC, + 2.5% = 0.0522750
    expect(started.quote).toMatchObject({ total: "0.0522750", fee: "0.0012750" });
    const tx = parse(started.xdr) as Transaction;
    expect(tx.operations.map((op) => op.type)).toEqual([
      "payment",
      "payment",
      "payment",
      "changeTrust",
    ]);
    expect(tx.operations[0]).toMatchObject({ destination: mother, amount: "0.0510000" });
    expect(env.orders.get(ORDER)).toMatchObject({ currency: "USDC", method: "WALLET" });
  });

  it("XLM pays only the fee; the platform sends nothing and doesn't sign", async () => {
    const { ctx, chain, orders } = setup({ account: horizonAccount({ bandcoin: "0" }) });
    const started = await startRecharge(ctx, me, trustIn("XLM"));
    expect(started.quote).toMatchObject({ total: "0.0125000", sendXlm: "0" });
    const tx = parse(started.xdr) as Transaction;
    expect(tx.operations.map((op) => op.type)).toEqual(["payment", "changeTrust"]);
    expect(tx.operations[0]).toMatchObject({
      destination: chain.config.treasury,
      amount: "0.0125000",
    });
    await submitRecharge(ctx, me, { orderId: ORDER, xdr: started.xdr });
    expect(chain.signWithServerKeys).not.toHaveBeenCalled();
    expect(orders.get(ORDER)).toMatchObject({ currency: "XLM", status: "DELIVERED" });
  });

  it("an XLM shortfall says how much is missing", async () => {
    const { ctx } = setup({ account: horizonAccount({ xlm: "0.4", bandcoin: "0" }) });
    const quote = await quoteRecharge(ctx, me, trustIn("XLM"));
    expect(quote.problems[0]).toMatchObject({
      code: "INSUFFICIENT_FUNDS",
      shortfall: { currency: "XLM" },
    });
  });

  it("card charges $1.00 and sends the rest as BANDCOIN to a wallet that holds it", async () => {
    const { ctx, chain, orders } = setup({ account: horizonAccount({ bandcoin: "0" }) });
    const started = await startRecharge(ctx, me, trustIn("USD"));
    expect(started.quote).toMatchObject({
      total: "1.0000000",
      sendXlm: "0.5000000",
      card: { openBandcoinLine: false },
    });
    expect(orders.get(ORDER)).toMatchObject({ method: "CARD", currency: "USD" });
    const tx = parse(started.xdr) as Transaction;
    expect(tx.operations.map((op) => op.type)).toEqual(["payment", "changeTrust", "payment"]);
    expect(tx.operations[0]).toMatchObject({ source: mother, destination: fan });
    expect(tx.operations[2]).toMatchObject({ source: mother, destination: fan });

    await submitRecharge(ctx, me, { orderId: ORDER, xdr: started.xdr, card: { sourceId: "c" } });
    expect(chain.card.charge).toHaveBeenCalledWith(expect.objectContaining({ cents: 100 }));
    const submitted = parse(chain.submit.mock.calls[0]![0]);
    expect(submitted).toBeInstanceOf(FeeBumpTransaction);
    expect(orders.get(ORDER)).toMatchObject({ status: "DELIVERED" });
  });

  it("card opens the BANDCOIN line too when the wallet has none", async () => {
    const { ctx } = setup({ account: horizonAccount() });
    const started = await startRecharge(ctx, me, trustIn("USD"));
    expect(started.quote).toMatchObject({
      sendXlm: "1.0000000",
      card: { openBandcoinLine: true },
    });
    const tx = parse(started.xdr) as Transaction;
    expect(tx.operations.map((op) => op.type)).toEqual([
      "payment",
      "changeTrust",
      "changeTrust",
      "payment",
    ]);
  });

  it("card: a wallet that declines charges nothing; a network refusal refunds", async () => {
    const declined = setup({ account: horizonAccount({ bandcoin: "0" }) });
    const first = await startRecharge(declined.ctx, me, trustIn("USD"));
    await expect(
      submitRecharge(declined.ctx, me, { orderId: ORDER, xdr: first.xdr }),
    ).rejects.toMatchObject({ message: "Add a card to pay." });
    expect(declined.chain.card.charge).not.toHaveBeenCalled();

    const refused = setup({
      account: horizonAccount({ bandcoin: "0" }),
      submit: () => Promise.reject(new Error("tx_failed")),
    });
    const second = await startRecharge(refused.ctx, me, trustIn("USD"));
    await expect(
      submitRecharge(refused.ctx, me, { orderId: ORDER, xdr: second.xdr, card: { sourceId: "c" } }),
    ).rejects.toThrow("tx_failed");
    expect(refused.chain.card.refund).toHaveBeenCalledWith({
      orderId: ORDER,
      paymentId: "pay1",
      cents: 100,
    });
    expect(refused.orders.get(ORDER)).toMatchObject({ status: "REFUNDED" });
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

  it("lists the card packages for the page", async () => {
    await expect(callerFor(null).recharge.options()).resolves.toEqual({
      packagesUsd: ["1.99", "4.99", "9.99", "19.99", "24.99", "49.99", "99.99"],
    });
  });

  it("only takes the listed packages, and needs a signed-in fan to start", async () => {
    await expect(
      callerFor(me).recharge.quote({ kind: "TOP_UP", packageUsd: "9.98" as never }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(callerFor(null).recharge.start(topUp)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(callerFor(null).recharge.submit({ orderId: "o", xdr: "x" })).rejects.toMatchObject(
      { code: "UNAUTHORIZED" },
    );
  });
});
