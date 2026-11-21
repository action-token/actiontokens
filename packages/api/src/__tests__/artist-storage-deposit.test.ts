import {
  Account,
  Keypair,
  Networks,
  type Transaction,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { describe, expect, it, vi } from "vitest";

import type { Db } from "@actiontokens/db";

import type { SessionUser } from "../context";
import type { ChainGateway } from "../services/chain-gateway";
import {
  quoteDeposit,
  startDeposit,
  submitDeposit,
  walletContents,
} from "../services/artist/storage-deposit";

const wallet = Keypair.random();
const storageKey = Keypair.random().publicKey();
const fan = { code: "LUNA", issuer: Keypair.random().publicKey() };
const other = { code: "OTHER", issuer: Keypair.random().publicKey() };
const actionToken = { code: "ACTION", issuer: Keypair.random().publicKey() };
const usdc = { code: "USDC", issuer: Keypair.random().publicKey() };
const network = { passphrase: Networks.TESTNET, baseFee: "100" };
const ORDER = "cmvorder0000000000000041";
const me: SessionUser = {
  id: "me",
  role: "ARTIST",
  walletAddress: wallet.publicKey(),
  walletType: "freighter",
};
const artist = { storageAccountId: "st1", fanTokenItemId: "fan" };

type Row = Record<string, unknown>;
const credit = (asset: { code: string; issuer: string }, balance: string) => ({
  asset_type: "credit_alphanum4",
  asset_code: asset.code,
  asset_issuer: asset.issuer,
  balance,
  selling_liabilities: "0",
});

function setup(opts: { xlm?: string } = {}) {
  const orders = new Map<string, Row>();
  const db = {
    chainAccount: {
      findUnique: vi.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(
          where.id === "st1" ? { publicKey: storageKey, activatedAt: new Date() } : null,
        ),
      ),
    },
    classicToken: { findUnique: vi.fn().mockResolvedValue(fan) },
    order: {
      create: vi.fn(({ data }: { data: Row }) => {
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
        ({ where, data }: { where: { id: string; status: { in: string[] } }; data: Row }) => {
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
  const mine = Object.assign(new Account(wallet.publicKey(), "5"), {
    subentry_count: 2,
    balances: [
      { asset_type: "native", balance: opts.xlm ?? "10", selling_liabilities: "0" },
      credit(other, "40"),
      credit(fan, "300"),
    ],
  });
  const storage = Object.assign(new Account(storageKey, "1"), {
    subentry_count: 3,
    balances: [
      { asset_type: "native", balance: "4", selling_liabilities: "0" },
      credit(fan, "1000000"),
      credit(actionToken, "0"),
      credit(usdc, "0"),
    ],
  });
  const chain = {
    config: { name: "testnet", network, assets: { actionToken, usdc } },
    loadAccount: vi.fn((id: string) => Promise.resolve(id === storageKey ? storage : mine)),
    signWithServerKeys: vi.fn((xdr: string) => Promise.resolve(xdr)),
    submit: vi.fn((_xdr: string) => Promise.resolve({ hash: "txhash" })),
  };
  const activity = { set: vi.fn(), facts: () => ({}) };
  const ctx = { db: db as unknown as Db, chain: chain as unknown as ChainGateway, activity };
  return { ctx, chain, orders };
}

const signed = (xdr: string) => {
  const tx = TransactionBuilder.fromXDR(xdr, Networks.TESTNET) as Transaction;
  tx.sign(wallet);
  return tx.toXDR();
};

describe("the wallet next to storage", () => {
  it("lists spendable XLM, then the fan token, then other tokens", async () => {
    const contents = await walletContents(setup().ctx, me, artist);
    expect(contents?.holdings).toMatchObject([
      { code: "XLM", issuer: null, amount: "8.0000000", kind: "xlm" },
      { code: "LUNA", amount: "300.0000000", fanToken: true, kind: "fanToken" },
      { code: "OTHER", amount: "40.0000000", fanToken: false, kind: "other" },
    ]);
  });
});

describe("moving into storage", () => {
  it("costs only the fee for a token storage already holds", async () => {
    const quote = await quoteDeposit(setup().ctx, me, artist, { ...fan, amount: "50" });
    expect(quote).toMatchObject({ ok: true, total: "0.0000100" });
    expect(quote.lines.map((line) => line.key)).toEqual(["networkFee", "total"]);
  });

  it("adds storage's 0.5 XLM trustline reserve for a new token", async () => {
    const quote = await quoteDeposit(setup().ctx, me, artist, { ...other, amount: "10" });
    expect(quote).toMatchObject({ ok: true, total: "0.5000300" });
    expect(quote.lines[0]).toMatchObject({ key: "reserve", label: "Let storage hold OTHER" });
  });

  it("refuses more than the wallet holds, and XLM it can't spare", async () => {
    expect(
      (await quoteDeposit(setup().ctx, me, artist, { ...fan, amount: "301" })).problems[0],
    ).toMatchObject({ message: "Your wallet has only 300 LUNA to move." });
    const xlm = await quoteDeposit(setup({ xlm: "3" }).ctx, me, artist, {
      code: "XLM",
      issuer: null,
      amount: "2",
    });
    expect(xlm.problems[0]).toMatchObject({ code: "INSUFFICIENT_FUNDS" });
    expect(
      (
        await quoteDeposit(
          setup().ctx,
          me,
          { ...artist, storageAccountId: null },
          { ...fan, amount: "1" },
        )
      ).problems[0]?.message,
    ).toBe("Your storage account isn't open.");
  });

  it("sends exactly the prepared payment, storage co-signing only to open a trustline", async () => {
    const plain = setup();
    const started = await startDeposit(plain.ctx, me, artist, { ...fan, amount: "50" });
    expect(started.signer).toBe("wallet");
    await submitDeposit(plain.ctx, me, artist, {
      orderId: started.orderId,
      xdr: signed(started.xdr),
    });
    expect(plain.chain.signWithServerKeys).not.toHaveBeenCalled();
    const sent = TransactionBuilder.fromXDR(
      plain.chain.submit.mock.calls[0]![0],
      Networks.TESTNET,
    ) as Transaction;
    expect(sent.operations).toMatchObject([
      { type: "payment", destination: storageKey, amount: "50.0000000" },
    ]);
    expect(plain.orders.get(ORDER)).toMatchObject({ kind: "STORAGE_DEPOSIT", status: "DELIVERED" });

    const fresh = setup();
    const next = await startDeposit(fresh.ctx, me, artist, { ...other, amount: "10" });
    await submitDeposit(fresh.ctx, me, artist, { orderId: next.orderId, xdr: signed(next.xdr) });
    expect(fresh.chain.signWithServerKeys).toHaveBeenCalledWith(expect.any(String), [storageKey]);
  });
});
