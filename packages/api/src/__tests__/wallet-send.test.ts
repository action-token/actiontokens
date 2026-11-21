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
import { quoteSend, startSend, submitSend } from "../services/wallet/send";

const fan = Keypair.random().publicKey();
const friend = Keypair.random().publicKey();
const stranger = Keypair.random().publicKey();
const issuer = Keypair.random().publicKey();
const novaIssuer = Keypair.random().publicKey();
const network = { passphrase: Networks.TESTNET, baseFee: "100" };
const ORDER = "cmvorder0000000000000001";

const me: SessionUser = { id: "me", role: "FAN", walletAddress: fan, walletType: "freighter" };
const custodial: SessionUser = { ...me, walletType: "emailPass", email: "fan@example.com" };

type Line = { code: string; issuer: string; balance: string };
function horizonAccount(id: string, xlm: string, lines: Line[] = []) {
  return Object.assign(new Account(id, "100"), {
    subentry_count: lines.length,
    balances: [
      { asset_type: "native", balance: xlm, selling_liabilities: "0" },
      ...lines.map((line) => ({
        asset_type: "credit_alphanum4",
        asset_code: line.code,
        asset_issuer: line.issuer,
        balance: line.balance,
        selling_liabilities: "0",
      })),
    ],
  });
}

const nova = (balance: string) => ({ code: "NOVA", issuer: novaIssuer, balance });

function setup(
  opts: {
    mine?: ReturnType<typeof horizonAccount> | null;
    theirs?: ReturnType<typeof horizonAccount> | null;
    submit?: (xdr: string) => Promise<{ hash: string }>;
  } = {},
) {
  const orders = new Map<string, Record<string, unknown>>();
  const users = [
    { id: "u2", username: "mira", displayName: "Mira Okafor", walletAddress: friend },
    { id: "u3", username: "nowallet", displayName: null, walletAddress: null },
  ];
  const db = {
    user: {
      findUnique: vi.fn(({ where }: { where: { username: string } }) =>
        Promise.resolve(users.find((user) => user.username === where.username) ?? null),
      ),
      findFirst: vi.fn(({ where }: { where: { walletAddress: string } }) =>
        Promise.resolve(users.find((user) => user.walletAddress === where.walletAddress) ?? null),
      ),
    },
    order: {
      create: vi.fn(({ data }: { data: Record<string, unknown> }) => {
        const row = { id: ORDER, status: "QUOTED", buyerId: "me", ...data };
        orders.set(ORDER, row);
        return Promise.resolve(row);
      }),
      findUnique: vi.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(orders.get(where.id) ?? null),
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
  const mine = opts.mine === undefined ? horizonAccount(fan, "20", [nova("50")]) : opts.mine;
  const theirs = opts.theirs === undefined ? horizonAccount(friend, "5", [nova("0")]) : opts.theirs;
  const chain = {
    config: {
      name: "testnet",
      network,
      assets: {
        actionToken: { code: "ACTION", issuer },
        usdc: { code: "USDC", issuer: Keypair.random().publicKey() },
      },
    },
    loadAccount: vi.fn((id: string) => Promise.resolve(id === fan ? mine : theirs)),
    signForCustodialUser: vi.fn((xdr: string) => Promise.resolve(xdr)),
    signWithServerKeys: vi.fn((xdr: string) => Promise.resolve(xdr)),
    submit: vi.fn(opts.submit ?? ((_xdr: string) => Promise.resolve({ hash: "txhash" }))),
  };
  const activity = { set: vi.fn(), facts: () => ({}) };
  const ctx = { db: db as unknown as Db, chain: chain as unknown as ChainGateway, activity };
  return { ctx, chain, orders };
}

const parse = (xdr: string) => TransactionBuilder.fromXDR(xdr, Networks.TESTNET) as Transaction;
const novaTo = (to: string, amount = "10") => ({ to, code: "NOVA", issuer: novaIssuer, amount });
const xlmTo = (to: string, amount = "2") => ({ to, code: "XLM", issuer: null, amount });

describe("send quote", () => {
  it("finds an Action Tokens user by @username and pays them straight when they hold the token", async () => {
    const quote = await quoteSend(setup().ctx, me, novaTo("@mira"));
    expect(quote).toMatchObject({
      ok: true,
      mode: "payment",
      recipient: { address: friend, username: "mira", name: "Mira Okafor" },
      total: "0.0000100",
    });
  });

  it("names the Action Tokens user behind a pasted address", async () => {
    const quote = await quoteSend(setup().ctx, me, novaTo(friend));
    expect(quote.recipient).toMatchObject({ address: friend, username: "mira" });
  });

  it("sends a token they can't hold yet as a gift, and the sender pays the 1 XLM it holds", async () => {
    const quote = await quoteSend(
      setup({ theirs: horizonAccount(stranger, "5") }).ctx,
      me,
      novaTo(stranger),
    );
    expect(quote).toMatchObject({ ok: true, mode: "gift", total: "1.0000100" });
    expect(quote.lines.map((line) => line.key)).toEqual(["send", "reserve", "networkFee", "total"]);
  });

  it("opens an account that doesn't exist yet with XLM, but only with at least 1 XLM", async () => {
    const ctx = setup({ theirs: null }).ctx;
    await expect(quoteSend(ctx, me, xlmTo(stranger, "2"))).resolves.toMatchObject({
      ok: true,
      mode: "create",
      total: "2.0000100",
    });
    await expect(quoteSend(ctx, me, xlmTo(stranger, "0.5"))).resolves.toMatchObject({
      ok: false,
      problems: [{ code: "UNAVAILABLE", message: "That account needs at least 1 XLM to open." }],
    });
    // a token to an account that doesn't exist goes as a gift they accept once it does
    await expect(quoteSend(ctx, me, novaTo(stranger))).resolves.toMatchObject({ mode: "gift" });
  });

  it("refuses an unknown or walletless user, a bad address, yourself, and more than the wallet holds", async () => {
    const { ctx } = setup();
    const problem = async (input: Parameters<typeof quoteSend>[2]) =>
      (await quoteSend(ctx, me, input)).problems[0]?.message;
    expect(await problem(novaTo("@nobody"))).toBe("There's no Action Tokens user called @nobody.");
    expect(await problem(novaTo("@nowallet"))).toBe("@nowallet doesn't have a wallet yet.");
    expect(await problem(novaTo("GNOTANADDRESS"))).toBe(
      "Enter a Stellar address (G…) or an Action Tokens @username.",
    );
    expect(await problem(novaTo(fan))).toBe("That's your own wallet.");
    expect(await problem(novaTo("@mira", "60"))).toBe("Your wallet has only 50 NOVA to send.");
    expect(await problem(novaTo("@mira", "0"))).toBe("Enter an amount above zero.");
    // 20 XLM with one line: 1.5 locked, so 18.5 spendable
    expect(await problem(xlmTo("@mira", "19"))).toBe("You need 0.50001 more XLM to send this.");
  });
});

describe("send", () => {
  it("creates a SEND order and the transaction, then sends it with the sender's signature only", async () => {
    const { ctx, chain, orders } = setup();
    const started = await startSend(ctx, me, novaTo("@mira"));
    expect(started.signer).toBe("wallet");
    expect(orders.get(ORDER)).toMatchObject({
      kind: "SEND",
      currency: "XLM",
      total: "0.0000100",
      status: "AWAITING_SIGNATURE",
      breakdown: expect.objectContaining({
        sendDetails: {
          to: friend,
          username: "mira",
          code: "NOVA",
          issuer: novaIssuer,
          amount: "10.0000000",
          mode: "payment",
        },
      }),
    });
    const tx = parse(started.xdr);
    expect(tx.source).toBe(fan);
    expect(tx.operations[0]).toMatchObject({ type: "payment", destination: friend });

    await expect(submitSend(ctx, me, { orderId: ORDER, xdr: started.xdr })).resolves.toEqual({
      orderId: ORDER,
      status: "DELIVERED",
    });
    expect(chain.signWithServerKeys).not.toHaveBeenCalled();
  });

  it("builds the gift as a claimable balance", async () => {
    const { ctx } = setup({ theirs: horizonAccount(stranger, "5") });
    const started = await startSend(ctx, me, novaTo(stranger));
    expect(parse(started.xdr).operations[0]?.type).toBe("createClaimableBalance");
  });

  it("won't start a send the quote refuses, and creates no order", async () => {
    const { ctx, orders } = setup();
    await expect(startSend(ctx, me, novaTo("@nobody"))).rejects.toMatchObject({
      message: "There's no Action Tokens user called @nobody.",
    });
    expect(orders.size).toBe(0);
  });

  it("signs for custodial accounts only on submit, and marks the order failed when Stellar refuses", async () => {
    const { ctx, chain, orders } = setup({ submit: () => Promise.reject(new Error("tx_failed")) });
    const started = await startSend(ctx, custodial, novaTo("@mira"));
    expect(started.signer).toBe("custodial");
    expect(chain.signForCustodialUser).not.toHaveBeenCalled();
    await expect(submitSend(ctx, custodial, { orderId: ORDER, xdr: started.xdr })).rejects.toThrow(
      "tx_failed",
    );
    expect(chain.signForCustodialUser).toHaveBeenCalledWith(started.xdr, "fan@example.com");
    expect(orders.get(ORDER)).toMatchObject({ status: "FAILED" });
  });
});
