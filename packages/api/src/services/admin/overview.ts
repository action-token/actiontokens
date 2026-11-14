import type { Context } from "../../context";
import { listAlerts } from "./alerts";
import { muralCounts } from "./murals";
import { pinCounts } from "./pins";

/**
 * Admin › Overview: what needs a look, and a few totals. Counts only, worked
 * out when the page loads; each one is the same filter its own admin page
 * uses, so the number matches what the admin finds there.
 *
 * "Today" is the last 24 hours and "this week" the last 7 days, as Alerts
 * counts them. Stuck payments and broken domains are also alerts, so they can
 * count once in their own tile and once in "open alerts".
 *
 * Studio coins: every balance added up now, how many people hold any, and
 * every coin ever carried over from the old credits (coins don't remember
 * where they came from, so "carried over and still held" can't be counted).
 */
const DAY = 24 * 60 * 60 * 1000;
const WEEK = 7 * DAY;

export async function getOverview(ctx: Pick<Context, "db">, now = new Date()) {
  const { db } = ctx;
  const today = new Date(+now - DAY);
  const [
    alerts,
    artistsWaiting,
    pins,
    murals,
    failedPayments,
    failedJobs,
    brokenDomains,
    users,
    artists,
    items,
    salesThisWeek,
    liveStories,
    coinsHeld,
    holders,
    carriedOver,
  ] = await Promise.all([
    listAlerts(ctx, now),
    db.artist.count({ where: { status: "PENDING" } }),
    pinCounts(ctx),
    muralCounts(ctx),
    db.order.count({ where: { status: "FAILED", updatedAt: { gte: today } } }),
    db.job.count({ where: { status: "FAILED", updatedAt: { gte: today } } }),
    db.customDomain.count({ where: { status: "BROKEN" } }),
    db.user.count(),
    db.artist.count({ where: { status: "APPROVED" } }),
    db.item.count({ where: { deletedAt: null } }),
    db.order.count({
      where: {
        kind: "ITEM_PURCHASE",
        status: "DELIVERED",
        createdAt: { gte: new Date(+now - WEEK) },
      },
    }),
    db.story.count({ where: { removedAt: null, expiresAt: { gt: now } } }),
    db.studioBalance.aggregate({ _sum: { balance: true } }),
    db.studioBalance.count({ where: { balance: { gt: 0 } } }),
    db.studioLedgerEntry.aggregate({
      where: { kind: "MIGRATED", status: "CONFIRMED" },
      _sum: { amount: true },
    }),
  ]);
  // Waiting for the network longer than the alert setting allows.
  const stuckPayments = await db.order.count({
    where: {
      status: "SUBMITTED",
      updatedAt: { lt: new Date(+now - alerts.rules.stuckMinutes * 60_000) },
    },
  });

  return {
    attention: {
      artistsWaiting,
      pinsToReview: pins.pending,
      muralsToReview: murals.PENDING,
      openAlerts: alerts.alerts.length,
      stuckPayments,
      failedPaymentsToday: failedPayments,
      failedJobsToday: failedJobs,
      brokenDomains,
    },
    totals: { users, artists, items, salesThisWeek, liveStories },
    studio: {
      coinsHeld: Number(coinsHeld._sum.balance ?? 0),
      holders,
      carriedOver: Number(carriedOver._sum.amount ?? 0),
    },
    /** Minutes a payment may wait before it counts as stuck (Admin › Settings) */
    stuckMinutes: alerts.rules.stuckMinutes,
  };
}
