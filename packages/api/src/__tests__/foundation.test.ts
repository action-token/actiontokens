import { describe, expect, it, vi } from "vitest";

import type { Db } from "@actiontokens/db";
import { AppError, ErrorCodes } from "@actiontokens/errors";

import { logActivity } from "../activity/middleware";
import { maskEmail, REDACTED, redact } from "../activity/redact";
import { type Context, createContext, type SessionUser } from "../context";
import { appRouter } from "../root-app";
import type { ChainGateway } from "../services/chain-gateway";
import {
  canTransition,
  ORDER_TRANSITIONS,
  sourcesOf,
  transitionOrder,
} from "../services/order-state";
import { planDelivery, remainingCopies } from "../services/purchase/sale";
import { createCallerFactory, createRouter, publicProcedure } from "../trpc";

describe("redact", () => {
  it("removes secrets, signed transactions and card tokens, and masks emails", () => {
    const out = redact({
      email: "nadia@demo.bandcoin.io",
      xdr: "AAAAAgAAAAB…",
      card: { sourceId: "cnon:123", verificationToken: "vt" },
      password: "hunter2",
      note: "my key is SCZANGBA5YHTNYVVV3C7CAZMTQDBJHJG6C34CJDQ66EQ7DZTPBRJFN4A ok",
      quantity: 2,
    });
    expect(out).toEqual({
      email: "n***@demo.bandcoin.io",
      xdr: REDACTED,
      card: { sourceId: REDACTED, verificationToken: REDACTED },
      password: REDACTED,
      note: `my key is ${REDACTED} ok`,
      quantity: 2,
    });
  });

  it("clips long strings and long lists", () => {
    const out = redact({ bio: "x".repeat(1000), ids: Array.from({ length: 60 }, (_, i) => i) }) as {
      bio: string;
      ids: unknown[];
    };
    expect(out.bio).toHaveLength(301);
    expect(out.ids).toHaveLength(51);
    expect(maskEmail("bad")).toBe(REDACTED);
  });
});

describe("order state machine", () => {
  it("allows only the documented moves", () => {
    expect(canTransition("QUOTED", "AWAITING_SIGNATURE")).toBe(true);
    expect(canTransition("AWAITING_SIGNATURE", "CANCELED")).toBe(true);
    expect(canTransition("SUBMITTED", "CANCELED")).toBe(false);
    expect(canTransition("DELIVERED", "QUOTED")).toBe(false);
    expect(ORDER_TRANSITIONS.CANCELED).toEqual([]);
    expect(sourcesOf("CANCELED").sort()).toEqual(["AWAITING_SIGNATURE", "QUOTED"]);
  });

  it("refuses a move from a state that can't make it (a lost race)", async () => {
    const updateMany = vi
      .fn<
        (args: {
          where: { id: string; status: { in: string[] } };
          data: object;
        }) => Promise<{ count: number }>
      >()
      .mockResolvedValue({ count: 0 });
    const db = {
      order: {
        updateMany,
        findUnique: vi.fn().mockResolvedValue({ status: "DELIVERED" }),
      },
    } as unknown as Db;
    await expect(transitionOrder(db, "o1", "CANCELED")).rejects.toMatchObject({
      code: "RESOURCE_CONFLICT",
    });
    const call = updateMany.mock.calls[0]?.[0];
    expect(call?.where.id).toBe("o1");
    expect(call?.where.status.in.sort()).toEqual(["AWAITING_SIGNATURE", "QUOTED"]);
    expect(call?.data).toEqual({ status: "CANCELED" });
  });
});

const fan: SessionUser = {
  id: "u1",
  role: "FAN",
  walletAddress: "GABC",
  walletType: "emailPass",
  email: "nadia@demo.bandcoin.io",
};

function harness(session: Context["session"] = { user: fan }) {
  const create = vi
    .fn<(args: { data: Record<string, unknown> }) => Promise<unknown>>()
    .mockResolvedValue({});
  const db = { activityLog: { create } } as unknown as Db;
  const ctx = createContext({
    db,
    chain: {} as ChainGateway,
    app: "app",
    session,
    headers: new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1", "user-agent": "vitest" }),
  });
  return { ctx, create };
}

const testRouter = createRouter({
  like: publicProcedure.mutation(({ ctx }) => {
    ctx.activity.set({ targetType: "Item", targetId: "item-1" });
    return "ok";
  }),
  pay: publicProcedure.mutation(() => {
    throw new AppError(ErrorCodes.STELLAR_INSUFFICIENT_BALANCE);
  }),
  read: publicProcedure.query(() => "read"),
});

describe("activity log", () => {
  it("writes one row per mutation, with who, what, where and the redacted input", async () => {
    const { ctx, create } = harness();
    await createCallerFactory(testRouter)(ctx).like();
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]?.[0].data).toMatchObject({
      actorId: "u1",
      actorRole: "FAN",
      action: "like",
      targetType: "Item",
      targetId: "item-1",
      status: "SUCCESS",
      errorCode: null,
      app: "app",
      ip: "203.0.113.9",
      userAgent: "vitest",
    });
  });

  it("logs failures with the error code, and guests as GUEST", async () => {
    const { ctx, create } = harness(null);
    await expect(createCallerFactory(testRouter)(ctx).pay()).rejects.toThrow();
    expect(create.mock.calls[0]?.[0].data).toMatchObject({
      actorId: null,
      actorRole: "GUEST",
      status: "FAILED",
      errorCode: "STELLAR_INSUFFICIENT_BALANCE",
    });
  });

  it("doesn't log queries, and a failed log write never breaks the request", async () => {
    const { ctx, create } = harness();
    await createCallerFactory(testRouter)(ctx).read();
    expect(create).not.toHaveBeenCalled();

    create.mockRejectedValueOnce(new Error("db down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(createCallerFactory(testRouter)(ctx).like()).resolves.toBe("ok");
    spy.mockRestore();
  });

  it("covers every mutation in the app router", () => {
    const procedures = Object.entries(appRouter._def.procedures) as unknown as [
      string,
      { _def: { type: string; middlewares: unknown[] } },
    ][];
    const mutations = procedures.filter(([, procedure]) => procedure._def.type === "mutation");
    expect(mutations.length).toBeGreaterThan(0);
    for (const [, procedure] of mutations) {
      expect(procedure._def.middlewares).toContain(logActivity);
    }
  });
});

describe("delivery plan", () => {
  it("uses minted stock first and mints the rest with the artist's issuer", () => {
    expect(
      planDelivery({
        kind: "PRIMARY",
        quantity: 3,
        stockAccount: "GSTOCK",
        stockBalance: "1",
        minter: "GISSUER",
      }),
    ).toEqual({
      fromStock: { account: "GSTOCK", amount: "1.0000000" },
      mint: { issuer: "GISSUER", amount: "2.0000000" },
    });
    expect(
      planDelivery({
        kind: "PRIMARY",
        quantity: 2,
        stockAccount: null,
        stockBalance: "0",
        minter: "GISSUER",
      }),
    ).toEqual({
      mint: { issuer: "GISSUER", amount: "2.0000000" },
    });
  });

  it("never mints for a resale, or without an active issuer", () => {
    expect(() =>
      planDelivery({
        kind: "RESALE",
        quantity: 2,
        stockAccount: "GSELLER",
        stockBalance: "1",
        minter: "GISSUER",
      }),
    ).toThrow(/Not enough copies/);
    expect(() =>
      planDelivery({
        kind: "PRIMARY",
        quantity: 1,
        stockAccount: null,
        stockBalance: "0",
        minter: null,
      }),
    ).toThrow();
  });

  it("counts what's left on a listing", () => {
    expect(remainingCopies({ quantity: 10, quantitySold: 4 }, 100)).toBe(6);
    expect(remainingCopies({ quantity: null, quantitySold: 4 }, 5)).toBe(1);
    expect(remainingCopies({ quantity: null, quantitySold: 4 }, null)).toBeNull();
  });
});
