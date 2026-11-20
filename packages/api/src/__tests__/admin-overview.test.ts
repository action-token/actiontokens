import { describe, expect, it, vi } from "vitest";

import type { Db } from "@actiontokens/db";

import { createContext, type SessionUser } from "../context";
import { portalRouter } from "../root-portal";
import { getOverview } from "../services/admin/overview";
import type { ChainGateway } from "../services/chain-gateway";
import { createCallerFactory } from "../trpc";

const now = new Date("2026-11-13T12:00:00Z");
const ago = (ms: number) => new Date(+now - ms);
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

type Where = Record<string, unknown>;
type Row = Record<string, unknown> & { updatedAt?: Date; createdAt?: Date };

/** A small fake database: `count` really applies the filters the overview sends. */
function setup(
  opts: {
    stuckMinutes?: number;
    orders?: Row[];
    jobs?: Row[];
    artists?: Row[];
    reviewed?: string[];
  } = {},
) {
  const matches = (row: Row, where: Where = {}) =>
    Object.entries(where).every(([field, want]) => {
      const have = row[field];
      if (want !== null && typeof want === "object" && !(want instanceof Date)) {
        const range = want as { gte?: Date; lt?: Date; gt?: Date };
        const at = have as Date | undefined;
        if (!at) return false;
        return (
          (range.gte === undefined || at >= range.gte) &&
          (range.lt === undefined || at < range.lt) &&
          (range.gt === undefined || at > range.gt)
        );
      }
      return have === want;
    });
  const table = (rows: Row[]) => ({
    count: vi.fn(({ where }: { where?: Where } = {}) =>
      Promise.resolve(rows.filter((row) => matches(row, where)).length),
    ),
  });
  const orders = opts.orders ?? [];
  const stuck = (where: Where) => orders.filter((row) => matches(row, where));
  const db = {
    appSetting: {
      findUnique: vi
        .fn()
        .mockResolvedValue(
          opts.stuckMinutes ? { alertRules: { stuckMinutes: opts.stuckMinutes } } : null,
        ),
    },
    order: {
      ...table(orders),
      groupBy: vi.fn().mockResolvedValue([]),
      // Alerts reads stuck payments (SUBMITTED) and large paid orders through findMany.
      findMany: vi.fn(({ where }: { where: Where }) =>
        Promise.resolve(
          where.status === "SUBMITTED"
            ? stuck(where).map((row) => ({ kind: "ITEM_PURCHASE", buyerId: null, ...row }))
            : [],
        ),
      ),
    },
    job: table(opts.jobs ?? []),
    artist: table(opts.artists ?? []),
    user: { ...table([{}, {}, {}]), findMany: vi.fn().mockResolvedValue([]) },
    item: table([{ deletedAt: null }, { deletedAt: null }, { deletedAt: ago(DAY) }]),
    story: table([
      { removedAt: null, expiresAt: new Date(+now + DAY) },
      { removedAt: null, expiresAt: ago(MINUTE) },
      { removedAt: ago(MINUTE), expiresAt: new Date(+now + DAY) },
    ]),
    customDomain: {
      ...table([{ status: "BROKEN" }, { status: "LIVE" }]),
      findMany: vi.fn().mockResolvedValue([]),
    },
    pin: {
      groupBy: vi.fn().mockResolvedValue([
        { approval: "PENDING", _count: { _all: 4 } },
        { approval: "APPROVED", _count: { _all: 9 } },
      ]),
    },
    mural: {
      groupBy: vi.fn().mockResolvedValue([
        { status: "PENDING", _count: { _all: 2 } },
        { status: "APPROVED", _count: { _all: 7 } },
      ]),
    },
    activityLog: { groupBy: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue({}) },
    pinClaim: { findMany: vi.fn().mockResolvedValue([]) },
    adminAlertReview: {
      findMany: vi.fn(() => Promise.resolve((opts.reviewed ?? []).map((key) => ({ key })))),
    },
  };
  return { ctx: { db: db as unknown as Db }, db };
}

describe("admin overview", () => {
  it("counts each queue with the filter its own page uses", async () => {
    const { ctx } = setup({
      artists: [
        { status: "PENDING" },
        { status: "PENDING" },
        { status: "APPROVED" },
        { status: "BANNED" },
      ],
      orders: [
        { id: "stuck", status: "SUBMITTED", updatedAt: ago(11 * MINUTE) },
        { id: "fresh", status: "SUBMITTED", updatedAt: ago(9 * MINUTE) },
        { id: "f1", status: "FAILED", updatedAt: ago(DAY - MINUTE) },
        { id: "f2", status: "FAILED", updatedAt: ago(DAY + MINUTE) },
        { id: "s1", kind: "ITEM_PURCHASE", status: "DELIVERED", createdAt: ago(6 * DAY) },
        { id: "s2", kind: "ITEM_PURCHASE", status: "DELIVERED", createdAt: ago(8 * DAY) },
        { id: "g1", kind: "GIFT", status: "DELIVERED", createdAt: ago(DAY) },
      ],
      jobs: [
        { status: "FAILED", updatedAt: ago(MINUTE) },
        { status: "FAILED", updatedAt: ago(3 * DAY) },
        { status: "SUCCEEDED", updatedAt: ago(MINUTE) },
      ],
    });
    expect(await getOverview(ctx, now)).toEqual({
      attention: {
        artistsWaiting: 2,
        pinsToReview: 4,
        muralsToReview: 2,
        // the stuck payment is also an alert
        openAlerts: 1,
        stuckPayments: 1,
        failedPaymentsToday: 1,
        failedJobsToday: 1,
        brokenDomains: 1,
      },
      totals: { users: 3, artists: 1, items: 2, salesThisWeek: 1, liveStories: 1 },
      stuckMinutes: 10,
    });
  });

  it("uses the stuck setting from Admin › Settings, and leaves out alerts already reviewed", async () => {
    const stuckAt = ago(11 * MINUTE);
    const orders = [{ id: "o1", status: "SUBMITTED", updatedAt: stuckAt }];
    const patient = await getOverview(setup({ orders, stuckMinutes: 30 }).ctx, now);
    expect(patient.attention).toMatchObject({ stuckPayments: 0, openAlerts: 0 });
    expect(patient.stuckMinutes).toBe(30);

    const reviewed = await getOverview(
      setup({ orders, reviewed: [`stuck:o1:${stuckAt.toISOString()}`] }).ctx,
      now,
    );
    // Reviewing the alert hides it there; the payment is still stuck.
    expect(reviewed.attention).toMatchObject({ stuckPayments: 1, openAlerts: 0 });
  });

  it("shows zeros on an empty platform", async () => {
    const { attention } = await getOverview(setup().ctx, now);
    expect(attention).toMatchObject({ artistsWaiting: 0, openAlerts: 0, failedJobsToday: 0 });
  });

  it("is for admins only", async () => {
    const callerFor = (role: SessionUser["role"]) =>
      createCallerFactory(portalRouter)(
        createContext({
          db: setup().ctx.db,
          chain: {} as ChainGateway,
          app: "org",
          session: {
            user: { id: "u1", role, walletAddress: "GADMIN", walletType: "freighter" },
          },
        }),
      );
    await expect(callerFor("ARTIST").admin.overview()).rejects.toThrow(/admins only/);
    await expect(callerFor("ADMIN").admin.overview()).resolves.toMatchObject({
      totals: { users: 3 },
    });
  });
});
