import { describe, expect, it, vi } from "vitest";

import type { Db } from "@actiontokens/db";

import {
  DEFAULT_ALERT_RULES,
  distanceKm,
  listAlerts,
  reviewAlert,
  rulesOf,
} from "../services/admin/alerts";

const now = new Date("2026-10-31T12:00:00Z");
const minutesAgo = (minutes: number) => new Date(+now - minutes * 60_000);

type Row = Record<string, unknown>;

function setup(
  opts: {
    rules?: Row;
    failedGroups?: Row[];
    signInGroups?: Row[];
    paidOrders?: Row[];
    stuckOrders?: Row[];
    claims?: Row[];
    brokenDomains?: Row[];
    reviewed?: string[];
  } = {},
) {
  const findMany = vi.fn(({ where }: { where: { status: unknown; updatedAt?: { lt: Date } } }) =>
    Promise.resolve(
      where.status === "SUBMITTED" ? (opts.stuckOrders ?? []) : (opts.paidOrders ?? []),
    ),
  );
  const db = {
    appSetting: {
      findUnique: vi.fn().mockResolvedValue(opts.rules ? { alertRules: opts.rules } : null),
    },
    order: { groupBy: vi.fn().mockResolvedValue(opts.failedGroups ?? []), findMany },
    activityLog: { groupBy: vi.fn().mockResolvedValue(opts.signInGroups ?? []) },
    pinClaim: { findMany: vi.fn().mockResolvedValue(opts.claims ?? []) },
    customDomain: { findMany: vi.fn().mockResolvedValue(opts.brokenDomains ?? []) },
    adminAlertReview: {
      findMany: vi.fn(() => Promise.resolve((opts.reviewed ?? []).map((key) => ({ key })))),
      upsert: vi.fn().mockResolvedValue({}),
    },
    user: {
      findMany: vi.fn(({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(
          where.id.in.map((id) => ({
            id,
            username: id,
            displayName: null,
            avatarUrl: null,
            walletAddress: null,
          })),
        ),
      ),
    },
  };
  return { ctx: { db: db as unknown as Db }, db };
}

const claim = (id: string, userId: string, minutes: number, lat: number, lng: number) => ({
  id,
  userId,
  createdAt: minutesAgo(minutes),
  spot: { latitude: lat, longitude: lng },
});

describe("alert rules", () => {
  it("uses the saved thresholds and the defaults for anything missing or broken", () => {
    expect(rulesOf(null)).toEqual(DEFAULT_ALERT_RULES);
    expect(rulesOf({ failedPayments: 3, stuckMinutes: -1, largeOrderUsd: "x" })).toEqual({
      ...DEFAULT_ALERT_RULES,
      failedPayments: 3,
    });
  });

  it("measures distance on the globe", () => {
    // Dhaka to Chittagong is about 215 km.
    const km = distanceKm({ lat: 23.81, lng: 90.41 }, { lat: 22.36, lng: 91.78 });
    expect(km).toBeGreaterThan(200);
    expect(km).toBeLessThan(230);
  });
});

describe("listAlerts", () => {
  it("flags many failed payments and sign-ins only at the threshold", async () => {
    const { ctx } = setup({
      failedGroups: [
        { buyerId: "u1", _count: { _all: 5 }, _max: { updatedAt: minutesAgo(5) } },
        { buyerId: "u2", _count: { _all: 4 }, _max: { updatedAt: minutesAgo(5) } },
      ],
      signInGroups: [
        { ip: "1.2.3.4", _count: { _all: 10 }, _max: { createdAt: minutesAgo(1) } },
        { ip: "5.6.7.8", _count: { _all: 2 }, _max: { createdAt: minutesAgo(1) } },
      ],
    });
    const { alerts } = await listAlerts(ctx, now);
    expect(alerts.map((alert) => [alert.kind, alert.user?.id ?? null])).toEqual([
      ["signInFailures", null],
      ["failedPayments", "u1"],
    ]);
    expect(alerts[0]?.detail).toContain("1.2.3.4");
  });

  it("flags two claims in a row that no one could travel between, but not nearby ones", async () => {
    const { ctx } = setup({
      claims: [
        // u1: Dhaka, then Chittagong 10 minutes later (~1,300 km/h)
        claim("c1", "u1", 30, 23.81, 90.41),
        claim("c2", "u1", 20, 22.36, 91.78),
        // u2: two spots 200 m apart a minute apart
        claim("c3", "u2", 10, 23.81, 90.41),
        claim("c4", "u2", 9, 23.8118, 90.41),
      ],
    });
    const { alerts } = await listAlerts(ctx, now);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ kind: "fastClaims", key: "fastClaims:u1:c2", userId: "u1" });
  });

  it("flags large paid orders in USD, and payments stuck on the network", async () => {
    const { ctx } = setup({
      paidOrders: [
        {
          id: "o1",
          buyerId: "u1",
          total: 1500,
          currency: "USDC",
          rateUsd: null,
          createdAt: minutesAgo(60),
        },
        {
          id: "o2",
          buyerId: "u2",
          total: 100_000,
          currency: "ACTION",
          rateUsd: 0.005,
          createdAt: minutesAgo(60),
        },
        {
          id: "o3",
          buyerId: "u3",
          total: 999_999,
          currency: "XLM",
          rateUsd: null,
          createdAt: minutesAgo(60),
        },
      ],
      stuckOrders: [
        { id: "o4", buyerId: "u4", kind: "ITEM_PURCHASE", txHash: "h", updatedAt: minutesAgo(30) },
      ],
    });
    const { alerts } = await listAlerts(ctx, now);
    expect(alerts.map((alert) => [alert.kind, alert.orderId])).toEqual([
      ["stuck", "o4"],
      ["largeOrder", "o1"],
    ]);
  });

  it("flags a custom domain that stopped working, once per time it broke", async () => {
    const since = minutesAgo(90);
    const { ctx, db } = setup({
      brokenDomains: [
        {
          id: "d1",
          domain: "coldplay.com",
          brokenSince: since,
          lastError: "The DNS records aren't pointing at Action Tokens yet.",
          createdAt: since,
          organization: { userId: "artist1", name: "Luna" },
        },
      ],
    });
    const { alerts } = await listAlerts(ctx, now);
    expect(alerts).toEqual([
      expect.objectContaining({
        key: `brokenDomain:d1:${since.toISOString()}`,
        kind: "brokenDomain",
        title: "Custom domain stopped working",
        userId: "artist1",
      }),
    ]);
    expect(alerts[0]!.detail).toContain("coldplay.com (Luna)");
    expect(db.customDomain.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "BROKEN" } }),
    );
  });

  it("hides alerts already marked reviewed", async () => {
    const { ctx } = setup({
      stuckOrders: [
        { id: "o4", buyerId: null, kind: "ITEM_PURCHASE", txHash: "h", updatedAt: minutesAgo(30) },
      ],
      reviewed: [`stuck:o4:${minutesAgo(30).toISOString()}`],
    });
    expect((await listAlerts(ctx, now)).alerts).toEqual([]);
  });

  it("uses the saved thresholds", async () => {
    const { ctx, db } = setup({ rules: { stuckMinutes: 60 } });
    const { rules } = await listAlerts(ctx, now);
    expect(rules.stuckMinutes).toBe(60);
    const stuckQuery = db.order.findMany.mock.calls.find(
      ([args]) => args.where.status === "SUBMITTED",
    )?.[0];
    expect(stuckQuery?.where.updatedAt?.lt).toEqual(minutesAgo(60));
  });
});

describe("reviewAlert", () => {
  it("records who reviewed it and why, logging the alert", async () => {
    const { ctx, db } = setup();
    const activity = { set: vi.fn(), facts: () => ({}) };
    await reviewAlert(
      { ...ctx, activity },
      { id: "admin1" },
      {
        key: "stuck:o4:x",
        kind: "stuck",
        note: "  checked on Stellar ",
      },
    );
    expect(db.adminAlertReview.upsert).toHaveBeenCalledWith({
      where: { key: "stuck:o4:x" },
      create: {
        key: "stuck:o4:x",
        kind: "stuck",
        reviewerId: "admin1",
        note: "checked on Stellar",
      },
      update: {
        key: "stuck:o4:x",
        kind: "stuck",
        reviewerId: "admin1",
        note: "checked on Stellar",
      },
    });
    expect(activity.set).toHaveBeenCalledWith({ targetType: "Alert", targetId: "stuck:o4:x" });
  });
});
