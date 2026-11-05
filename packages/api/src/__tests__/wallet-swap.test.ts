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
import { quoteSwap, startSwap, submitSwap } from "../services/wallet/swap";

const mother = Keypair.random().publicKey();
const fan = Keypair.random().publicKey();
const issuer = Keypair.random().publicKey();
const network = { passphrase: Networks.TESTNET, baseFee: "100" };
const ORDER = "cmvorder0000000000000001";

const me: SessionUser = { id: "me", role: "FAN", walletAddress: fan, walletType: "freighter" };
const custodial: SessionUser = { ...me, walletType: "emailPass", email: "fan@example.com" };

/** A Horizon account; `bandcoin` undefined means no BANDCOIN line. */
function horizonAccount(id: string, { xlm = "10", bandcoin }: { xlm?: string; bandcoin?: string }) {
  return Object.assign(new Account(id, "100"), {
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
              selling_liabilities: "0",
            },
          ]),
    ],
  });
}

function setup(
  opts: {
    fanAccount?: ReturnType<typeof horizonAccount> | null;
    treasury?: ReturnType<typeof horizonAccount> | null;
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
  const fanAccount =
    opts.fanAccount === undefined ? horizonAccount(fan, { bandcoin: "1000" }) : opts.fanAccount;
  const treasury =
    opts.treasury === undefined
      ? horizonAccount(mother, { xlm: "1000", bandcoin: "100000" })
      : opts.treasury;
  const chain = {
    config: {
      name: "testnet",
      network,
      assets: {
        bandcoin: { code: "BANDCOIN", issuer },
        usdc: { code: "USDC", issuer: Keypair.random().publicKey() },
      },
      mother: opts.motherKey === undefined ? mother : opts.motherKey,
    },
    loadAccount: vi.fn((id: string) => Promise.resolve(id === mother ? treasury : fanAccount)),
    rates: vi.fn().mockResolvedValue({ xlmUsd: "0.1", usdcUsd: "1" }),
    bandcoinUsd: vi.fn().mockResolvedValue("0.002"),
    signWithServerKeys: vi.fn((xdr: string) => Promise.resolve(xdr)),
    signForCustodialUser: vi.fn((xdr: string) => Promise.resolve(xdr)),
    submit: vi.fn(opts.submit ?? ((_xdr: string) => Promise.resolve({ hash: "txhash" }))),
  };
  const activity = { set: vi.fn(), facts: () => ({}) };
  const ctx = { db: db as unknown as Db, chain: chain as unknown as ChainGateway, activity };
  return { ctx, chain, orders };
}

const parse = (xdr: string) => TransactionBuilder.fromXDR(xdr, Networks.TESTNET) as Transaction;
const toXlm = { direction: "TO_XLM" as const, amount: "100" };
const toBandcoin = { direction: "TO_BANDCOIN" as const, amount: "2" };

describe("swap quote", () => {
  it("prices any amount either way from the wallet's and the treasury's balances", async () => {
    const { ctx } = setup();
    await expect(quoteSwap(ctx, me, toXlm)).resolves.toMatchObject({
      ok: true,
      pay: { currency: "BANDCOIN", amount: "100.0000000" },
      receive: { currency: "XLM", amount: "1.9600000" },
    });
    await expect(quoteSwap(ctx, me, toBandcoin)).resolves.toMatchObject({
      ok: true,
      receive: { currency: "BANDCOIN", amount: "98.0000000" },
    });
  });

  it("opens the BANDCOIN line when swapping XLM into a wallet without one", async () => {
    const { ctx } = setup({ fanAccount: horizonAccount(fan, {}) });
    const quote = await quoteSwap(ctx, me, toBandcoin);
    expect(quote.lines.map((line) => line.key)).toContain("reserve");
  });

  it("refuses with no treasury key, a treasury that can't cover it, or a wallet not on the network", async () => {
    const unavailable = { code: "UNAVAILABLE", message: "Swap isn't available right now." };
    await expect(quoteSwap(setup({ motherKey: null }).ctx, me, toXlm)).resolves.toMatchObject({
      ok: false,
      problems: [unavailable],
    });
    await expect(
      quoteSwap(setup({ treasury: horizonAccount(mother, { xlm: "2" }) }).ctx, me, toXlm),
    ).resolves.toMatchObject({ ok: false, problems: [unavailable] });
    await expect(quoteSwap(setup({ fanAccount: null }).ctx, me, toXlm)).resolves.toMatchObject({
      ok: false,
      problems: [
        { code: "UNAVAILABLE", message: "Your wallet needs its first XLM before it can swap." },
      ],
    });
  });

  it("shows the price as unavailable when it can't be loaded", async () => {
    const { ctx, chain } = setup();
    chain.bandcoinUsd.mockRejectedValue(new Error("down"));
    const quote = await quoteSwap(ctx, me, toXlm);
    expect(quote.problems[0]?.code).toBe("RATE_UNAVAILABLE");
  });
});

describe("swap", () => {
  it("BANDCOIN to XLM: an XLM_SWAP order and one transaction both ways, co-signed by the treasury", async () => {
    const { ctx, chain, orders } = setup();
    const started = await startSwap(ctx, me, toXlm);
    expect(started.signer).toBe("wallet");
    expect(orders.get(ORDER)).toMatchObject({
      kind: "XLM_SWAP",
      method: "WALLET",
      currency: "BANDCOIN",
      total: "100.0000000",
      status: "AWAITING_SIGNATURE",
    });
    const tx = parse(started.xdr);
    expect(tx.operations.map((op) => op.type)).toEqual(["payment", "payment"]);
    expect(tx.operations[1]).toMatchObject({
      source: mother,
      destination: fan,
      amount: "1.9600000",
    });

    await expect(submitSwap(ctx, me, { orderId: ORDER, xdr: started.xdr })).resolves.toEqual({
      orderId: ORDER,
      status: "DELIVERED",
    });
    expect(chain.signWithServerKeys).toHaveBeenCalledWith(started.xdr, [mother]);
  });

  it("XLM to BANDCOIN: a BANDCOIN_SWAP order paid in XLM", async () => {
    const { ctx, orders } = setup({ fanAccount: horizonAccount(fan, {}) });
    const started = await startSwap(ctx, me, toBandcoin);
    expect(orders.get(ORDER)).toMatchObject({
      kind: "BANDCOIN_SWAP",
      currency: "XLM",
      total: "2.0000000",
    });
    expect(parse(started.xdr).operations.map((op) => op.type)).toEqual([
      "changeTrust",
      "payment",
      "payment",
    ]);
  });

  it("won't start when the fan is short, and creates no order", async () => {
    const { ctx, orders } = setup();
    await expect(startSwap(ctx, me, { direction: "TO_XLM", amount: "5000" })).rejects.toMatchObject(
      { message: "You need 4000 more BANDCOIN." },
    );
    expect(orders.size).toBe(0);
  });

  it("signs for custodial accounts only on submit, and refuses another order's transaction", async () => {
    const { ctx, chain } = setup();
    const started = await startSwap(ctx, custodial, toXlm);
    expect(started.signer).toBe("custodial");
    expect(chain.signForCustodialUser).not.toHaveBeenCalled();
    const other = await startSwap(setup().ctx, me, { direction: "TO_XLM", amount: "50" });
    await expect(
      submitSwap(ctx, custodial, { orderId: ORDER, xdr: other.xdr }),
    ).rejects.toMatchObject({ message: "That transaction doesn't belong to this order." });
    await submitSwap(ctx, custodial, { orderId: ORDER, xdr: started.xdr });
    expect(chain.signForCustodialUser).toHaveBeenCalledWith(started.xdr, "fan@example.com");
  });

  it("marks the order failed when Stellar refuses it", async () => {
    const { ctx, orders } = setup({ submit: () => Promise.reject(new Error("tx_failed")) });
    const started = await startSwap(ctx, me, toXlm);
    await expect(submitSwap(ctx, me, { orderId: ORDER, xdr: started.xdr })).rejects.toThrow(
      "tx_failed",
    );
    expect(orders.get(ORDER)).toMatchObject({ status: "FAILED" });
  });
});
