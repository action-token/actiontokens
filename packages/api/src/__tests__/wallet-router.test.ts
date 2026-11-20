import { Account, Keypair } from "@stellar/stellar-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@actiontokens/db";

import { createContext, type SessionUser } from "../context";
import { appRouter } from "../root-app";
import { portalRouter } from "../root-portal";
import type { ChainGateway } from "../services/chain-gateway";
import { createCallerFactory } from "../trpc";

const send = vi.hoisted(() => ({
  quoteSend: vi.fn(),
  startSend: vi.fn(),
  submitSend: vi.fn(),
}));
const swap = vi.hoisted(() => ({
  quoteSwap: vi.fn(),
  startSwap: vi.fn(),
  submitSwap: vi.fn(),
}));
const purchase = vi.hoisted(() => ({ cancelPurchase: vi.fn() }));
vi.mock("../services/wallet/send", async (original) => ({
  ...(await original<typeof import("../services/wallet/send")>()),
  ...send,
}));
vi.mock("../services/wallet/swap", async (original) => ({
  ...(await original<typeof import("../services/wallet/swap")>()),
  ...swap,
}));
vi.mock("../services/purchase", async (original) => ({
  ...(await original<typeof import("../services/purchase")>()),
  ...purchase,
}));

const wallet = Keypair.random().publicKey();
const issuer = Keypair.random().publicKey();
const novaIssuer = Keypair.random().publicKey();
const me: SessionUser = { id: "me", role: "FAN", walletAddress: wallet, walletType: "freighter" };
const ORDER = "cmvorder0000000000000001";

function setup(order: { buyerId: string; kind: string } | null) {
  const account = Object.assign(new Account(wallet, "1"), {
    subentry_count: 2,
    balances: [
      { asset_type: "native", balance: "12", selling_liabilities: "0" },
      {
        asset_type: "credit_alphanum12",
        asset_code: "BANDCOIN",
        asset_issuer: issuer,
        balance: "250",
        selling_liabilities: "0",
      },
      {
        asset_type: "credit_alphanum4",
        asset_code: "NOVA",
        asset_issuer: novaIssuer,
        balance: "3",
        selling_liabilities: "0",
      },
    ],
  });
  const db = {
    order: { findUnique: vi.fn().mockResolvedValue(order && { id: ORDER, ...order }) },
    classicToken: {
      findMany: vi
        .fn()
        .mockResolvedValue([
          { code: "NOVA", issuer: novaIssuer, item: { id: "i1", title: "Nova fan token" } },
        ]),
    },
    activityLog: { create: vi.fn().mockResolvedValue({}) },
  };
  const chain = {
    config: {
      assets: {
        bandcoin: { code: "BANDCOIN", issuer },
        usdc: { code: "USDC", issuer: Keypair.random().publicKey() },
      },
    },
    loadAccount: vi.fn().mockResolvedValue(account),
  };
  const ctx = createContext({
    db: db as unknown as Db,
    chain: chain as unknown as ChainGateway,
    app: "app",
    session: { user: me },
  });
  const caller = createCallerFactory(appRouter)(ctx);
  const portal = createCallerFactory(portalRouter)(ctx);
  return { caller, portal };
}

beforeEach(() => vi.clearAllMocks());

describe("wallet send and swap", () => {
  it("passes the send and the swap to their services for the signed-in user", async () => {
    send.quoteSend.mockResolvedValue({ ok: true });
    swap.startSwap.mockResolvedValue({ orderId: ORDER });
    const { caller } = setup(null);
    const input = { to: "@mira", code: "NOVA", issuer: novaIssuer, amount: "1" };
    await caller.wallet.send.quote(input);
    await caller.wallet.swap.start({ direction: "TO_XLM", amount: "10" });
    expect(send.quoteSend).toHaveBeenCalledWith(expect.anything(), me, input);
    expect(swap.startSwap).toHaveBeenCalledWith(expect.anything(), me, {
      direction: "TO_XLM",
      amount: "10",
    });
  });

  it("cancels only the viewer's order of that kind", async () => {
    await setup({ buyerId: "me", kind: "SEND" }).caller.wallet.send.cancel({ orderId: ORDER });
    expect(purchase.cancelPurchase).toHaveBeenCalledTimes(1);
    for (const [order, call] of [
      [{ buyerId: "me", kind: "RECHARGE" }, "send"],
      [{ buyerId: "someone", kind: "SEND" }, "send"],
      [{ buyerId: "me", kind: "SEND" }, "swap"],
    ] as const) {
      await expect(
        setup(order).caller.wallet[call].cancel({ orderId: ORDER }),
      ).rejects.toMatchObject({ message: "Order not found" });
    }
    expect(purchase.cancelPurchase).toHaveBeenCalledTimes(1);
  });

  it("is in the artist portal too", async () => {
    swap.quoteSwap.mockResolvedValue({ ok: true });
    await setup(null).portal.wallet.swap.quote({
      direction: "TO_BANDCOIN",
      amount: "1",
    });
    expect(swap.quoteSwap).toHaveBeenCalled();
  });
});

describe("wallet assets", () => {
  it("lists XLM (spendable and reserved), then BANDCOIN, USDC and every other token by name", async () => {
    const assets = await setup(null).caller.wallet.assets();
    expect(assets).toMatchObject({
      address: wallet,
      active: true,
      // 12 XLM, 2 lines: (2 + 2) × 0.5 = 2 reserved
      xlm: { total: "12.0000000", spendable: "10.0000000", reserved: "2.0000000" },
    });
    expect(
      assets.tokens.map((token) => [token.code, token.kind, token.title, token.amount]),
    ).toEqual([
      ["XLM", "xlm", "Stellar Lumens", "10.0000000"],
      ["BANDCOIN", "bandcoin", "Bandcoin", "250.0000000"],
      ["USDC", "usdc", "USD Coin", "0.0000000"],
      ["NOVA", "other", "Nova fan token", "3.0000000"],
    ]);
  });
});
