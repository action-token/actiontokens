import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@actiontokens/db";

import { createContext, type SessionUser } from "../context";
import { arRouter } from "../root-ar";
import type { ChainGateway } from "../services/chain-gateway";
import { createCallerFactory } from "../trpc";

const recharge = vi.hoisted(() => ({
  quoteRecharge: vi.fn(),
  startRecharge: vi.fn(),
  submitRecharge: vi.fn(),
}));
const purchase = vi.hoisted(() => ({ cancelPurchase: vi.fn() }));
vi.mock("../services/recharge", () => recharge);
vi.mock("../services/purchase", async (original) => ({
  ...(await original<typeof import("../services/purchase")>()),
  ...purchase,
}));

const me: SessionUser = { id: "me", role: "FAN", walletAddress: "GME", walletType: "freighter" };
const ORDER = "cmvorder0000000000000001";

function setup(order: { buyerId: string; kind: string } | null) {
  const db = {
    order: { findUnique: vi.fn().mockResolvedValue(order && { id: ORDER, ...order }) },
    activityLog: { create: vi.fn().mockResolvedValue({}) },
  };
  const caller = createCallerFactory(arRouter)(
    createContext({
      db: db as unknown as Db,
      chain: {} as ChainGateway,
      app: "ar",
      session: { user: me },
    }),
  );
  return { db, caller };
}

beforeEach(() => vi.clearAllMocks());

describe("ar subscribe", () => {
  it("quotes and starts only the fan-token order", async () => {
    recharge.quoteRecharge.mockResolvedValue({ kind: "TOKEN_TRUST" });
    recharge.startRecharge.mockResolvedValue({ orderId: ORDER, xdr: "x", signer: "wallet" });
    const { caller } = setup(null);
    await caller.subscribe.quote({ organizationId: "a1", currency: "XLM" });
    await caller.subscribe.start({ organizationId: "a1", currency: "XLM" });
    expect(recharge.quoteRecharge).toHaveBeenCalledWith(expect.anything(), me, {
      kind: "TOKEN_TRUST",
      organizationId: "a1",
      currency: "XLM",
    });
    expect(recharge.startRecharge).toHaveBeenCalledWith(expect.anything(), me, {
      kind: "TOKEN_TRUST",
      organizationId: "a1",
      currency: "XLM",
    });
  });

  it("submits the viewer's fan-token order, with no card", async () => {
    recharge.submitRecharge.mockResolvedValue({ status: "COMPLETED" });
    const { caller } = setup({ buyerId: "me", kind: "TOKEN_TRUST" });
    await caller.subscribe.submit({ orderId: ORDER, xdr: "signed" });
    expect(recharge.submitRecharge).toHaveBeenCalledWith(expect.anything(), me, {
      orderId: ORDER,
      xdr: "signed",
    });
  });

  it("won't submit or cancel a top-up, a swap or someone else's order", async () => {
    for (const order of [
      { buyerId: "me", kind: "RECHARGE" },
      { buyerId: "me", kind: "XLM_SWAP" },
      { buyerId: "someone", kind: "TOKEN_TRUST" },
      null,
    ]) {
      const { caller } = setup(order);
      await expect(caller.subscribe.submit({ orderId: ORDER, xdr: "signed" })).rejects.toThrow(
        "Order not found",
      );
      await expect(caller.subscribe.cancel({ orderId: ORDER })).rejects.toThrow("Order not found");
    }
    expect(recharge.submitRecharge).not.toHaveBeenCalled();
    expect(purchase.cancelPurchase).not.toHaveBeenCalled();
  });

  it("cancels the viewer's fan-token order", async () => {
    const { caller } = setup({ buyerId: "me", kind: "TOKEN_TRUST" });
    await caller.subscribe.cancel({ orderId: ORDER });
    expect(purchase.cancelPurchase).toHaveBeenCalledWith(expect.anything(), me, ORDER);
  });
});
