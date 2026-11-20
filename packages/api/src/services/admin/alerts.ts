import type { Prisma } from "@bandcoin/db";

import type { Context, SessionUser } from "../../context";

/**
 * Admin › Alerts: things worth a look, worked out when the page loads (no
 * worker yet). Each alert has a key naming the exact occurrence (kind, who,
 * latest event), so marking it reviewed hides that one and a new occurrence
 * shows again. Thresholds come from AppSetting.alertRules over the defaults.
 */
type ServiceCtx = Pick<Context, "db" | "activity">;

export type AlertRules = {
  /** Failed payments by one person in 24 h */
  failedPayments: number;
  /** Failed sign-ins from one IP in 1 h */
  signInFailures: number;
  /** Two pin claims by one person further apart than this speed allows */
  claimSpeedKmh: number;
  /** One paid order worth more than this, in USD (last 7 days) */
  largeOrderUsd: number;
  /** A payment still SUBMITTED after this many minutes */
  stuckMinutes: number;
};

export const DEFAULT_ALERT_RULES: AlertRules = {
  failedPayments: 5,
  signInFailures: 10,
  claimSpeedKmh: 300,
  largeOrderUsd: 1000,
  stuckMinutes: 10,
};

export type AlertKind =
  | "failedPayments"
  | "signInFailures"
  | "fastClaims"
  | "largeOrder"
  | "stuck"
  | "brokenDomain";

export type Alert = {
  key: string;
  kind: AlertKind;
  title: string;
  detail: string;
  at: Date;
  userId: string | null;
  orderId?: string;
};

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
/** Claims closer than this are the same place, whatever the clock says */
const MIN_JUMP_KM = 1;
const CLAIMS_SCANNED = 5000;

export function rulesOf(saved: unknown): AlertRules {
  const value = (saved ?? {}) as Partial<Record<keyof AlertRules, unknown>>;
  const pick = (key: keyof AlertRules) =>
    typeof value[key] === "number" && value[key] > 0 ? value[key] : DEFAULT_ALERT_RULES[key];
  return {
    failedPayments: pick("failedPayments"),
    signInFailures: pick("signInFailures"),
    claimSpeedKmh: pick("claimSpeedKmh"),
    largeOrderUsd: pick("largeOrderUsd"),
    stuckMinutes: pick("stuckMinutes"),
  };
}

/** Great-circle distance in km. */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

async function failedPayments(ctx: Pick<Context, "db">, rules: AlertRules, now: Date) {
  const groups = await ctx.db.order.groupBy({
    by: ["buyerId"],
    where: { status: "FAILED", buyerId: { not: null }, updatedAt: { gte: new Date(+now - DAY) } },
    _count: { _all: true },
    _max: { updatedAt: true },
  });
  return groups
    .filter((group) => group._count._all >= rules.failedPayments && group.buyerId)
    .map((group): Alert => ({
      key: `failedPayments:${group.buyerId}:${group._max.updatedAt?.toISOString()}`,
      kind: "failedPayments",
      title: "Many failed payments",
      detail: `${plural(group._count._all, "payment")} failed in the last 24 hours.`,
      at: group._max.updatedAt ?? now,
      userId: group.buyerId,
    }));
}

async function signInFailures(ctx: Pick<Context, "db">, rules: AlertRules, now: Date) {
  const groups = await ctx.db.activityLog.groupBy({
    by: ["ip"],
    where: {
      action: "auth.signIn",
      status: "FAILED",
      ip: { not: null },
      createdAt: { gte: new Date(+now - HOUR) },
    },
    _count: { _all: true },
    _max: { createdAt: true },
  });
  return groups
    .filter((group) => group._count._all >= rules.signInFailures && group.ip)
    .map((group): Alert => ({
      key: `signInFailures:${group.ip}:${group._max.createdAt?.toISOString()}`,
      kind: "signInFailures",
      title: "Many failed sign-ins",
      detail: `${plural(group._count._all, "failed sign-in")} from ${group.ip} in the last hour.`,
      at: group._max.createdAt ?? now,
      userId: null,
    }));
}

async function largeOrders(ctx: Pick<Context, "db">, rules: AlertRules, now: Date) {
  const orders = await ctx.db.order.findMany({
    where: {
      status: { in: ["CONFIRMED", "DELIVERED"] },
      createdAt: { gte: new Date(+now - 7 * DAY) },
    },
    select: {
      id: true,
      buyerId: true,
      total: true,
      currency: true,
      rateUsd: true,
      createdAt: true,
    },
  });
  return orders.flatMap((order): Alert[] => {
    // A BANDCOIN or XLM order without its quoted rate can't be valued, so it's left out.
    const rate =
      order.currency === "USD" || order.currency === "USDC" ? 1 : Number(order.rateUsd ?? NaN);
    const usd = Number(order.total) * rate;
    if (!(usd > rules.largeOrderUsd)) return [];
    return [
      {
        key: `largeOrder:${order.id}`,
        kind: "largeOrder",
        title: "Large payment",
        detail: `${order.total.toString()} ${order.currency} (about ${Math.round(usd).toLocaleString("en")} USD).`,
        at: order.createdAt,
        userId: order.buyerId,
        orderId: order.id,
      },
    ];
  });
}

async function stuckPayments(ctx: Pick<Context, "db">, rules: AlertRules, now: Date) {
  const orders = await ctx.db.order.findMany({
    where: { status: "SUBMITTED", updatedAt: { lt: new Date(+now - rules.stuckMinutes * 60_000) } },
    select: { id: true, buyerId: true, kind: true, txHash: true, updatedAt: true },
    take: 200,
  });
  return orders.map((order): Alert => ({
    key: `stuck:${order.id}:${order.updatedAt.toISOString()}`,
    kind: "stuck",
    title: "Payment stuck",
    detail: `A ${order.kind.toLowerCase().replaceAll("_", " ")} has been waiting for the network since ${order.updatedAt.toISOString().slice(0, 16).replace("T", " ")} UTC.`,
    at: order.updatedAt,
    userId: order.buyerId,
    orderId: order.id,
  }));
}

/** Custom domains that were live and now fail (plan 32); one alert per time it broke. */
async function brokenDomains(ctx: Pick<Context, "db">) {
  const rows = await ctx.db.customDomain.findMany({
    where: { status: "BROKEN" },
    select: {
      id: true,
      domain: true,
      brokenSince: true,
      lastError: true,
      createdAt: true,
      artist: { select: { userId: true, name: true } },
    },
    take: 200,
  });
  return rows.map((row): Alert => {
    const since = row.brokenSince ?? row.createdAt;
    return {
      key: `brokenDomain:${row.id}:${since.toISOString()}`,
      kind: "brokenDomain",
      title: "Custom domain stopped working",
      detail: `${row.domain} (${row.artist.name}) fails since ${since.toISOString().slice(0, 10)}${row.lastError ? `: ${row.lastError}` : "."} The artist was told; it wasn't removed.`,
      at: since,
      userId: row.artist.userId,
    };
  });
}

/** For each person, the fastest jump between two claims in a row, when it beats the limit. */
async function fastClaims(ctx: Pick<Context, "db">, rules: AlertRules, now: Date) {
  const claims = await ctx.db.pinClaim.findMany({
    where: { createdAt: { gte: new Date(+now - DAY) } },
    orderBy: [{ userId: "asc" }, { createdAt: "asc" }],
    take: CLAIMS_SCANNED,
    select: {
      id: true,
      userId: true,
      createdAt: true,
      spot: { select: { latitude: true, longitude: true } },
    },
  });
  const worst = new Map<string, { kmh: number; km: number; claimId: string; at: Date }>();
  for (let index = 1; index < claims.length; index += 1) {
    const before = claims[index - 1]!;
    const after = claims[index]!;
    if (before.userId !== after.userId) continue;
    const km = distanceKm(
      { lat: before.spot.latitude, lng: before.spot.longitude },
      { lat: after.spot.latitude, lng: after.spot.longitude },
    );
    if (km < MIN_JUMP_KM) continue;
    const hours = Math.max(+after.createdAt - +before.createdAt, 1000) / HOUR;
    const kmh = km / hours;
    if (kmh <= rules.claimSpeedKmh) continue;
    const current = worst.get(after.userId);
    if (!current || kmh > current.kmh)
      worst.set(after.userId, { kmh, km, claimId: after.id, at: after.createdAt });
  }
  return [...worst].map(([userId, jump]): Alert => ({
    key: `fastClaims:${userId}:${jump.claimId}`,
    kind: "fastClaims",
    title: "Pin claims too far apart",
    detail: `Two claims ${Math.round(jump.km).toLocaleString("en")} km apart, as if moving at ${Math.round(jump.kmh).toLocaleString("en")} km/h.`,
    at: jump.at,
    userId,
  }));
}

/** Open alerts (not marked reviewed), newest first, with who they're about. */
export async function listAlerts(ctx: Pick<Context, "db">, now = new Date()) {
  const settings = await ctx.db.appSetting.findUnique({
    where: { id: 1 },
    select: { alertRules: true },
  });
  const rules = rulesOf(settings?.alertRules);
  const found = (
    await Promise.all([
      failedPayments(ctx, rules, now),
      signInFailures(ctx, rules, now),
      fastClaims(ctx, rules, now),
      largeOrders(ctx, rules, now),
      stuckPayments(ctx, rules, now),
      brokenDomains(ctx),
    ])
  ).flat();
  const reviewed = found.length
    ? await ctx.db.adminAlertReview.findMany({
        where: { key: { in: found.map((alert) => alert.key) } },
        select: { key: true },
      })
    : [];
  const done = new Set(reviewed.map((row) => row.key));
  const open = found.filter((alert) => !done.has(alert.key)).sort((a, b) => +b.at - +a.at);

  const userIds = [...new Set(open.flatMap((alert) => (alert.userId ? [alert.userId] : [])))];
  const users = userIds.length
    ? await ctx.db.user.findMany({
        where: { id: { in: userIds } },
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
          walletAddress: true,
        },
      })
    : [];
  const byId = new Map(users.map((user) => [user.id, user]));
  return {
    rules,
    alerts: open.map((alert) => {
      const user = alert.userId ? byId.get(alert.userId) : undefined;
      return {
        ...alert,
        user: user
          ? {
              id: user.id,
              name: user.displayName ?? user.username,
              avatarUrl: user.avatarUrl,
              walletAddress: user.walletAddress,
            }
          : null,
      };
    }),
  };
}

/** Latest reviews, for the "Reviewed" list. */
export async function listReviewedAlerts(ctx: Pick<Context, "db">) {
  return ctx.db.adminAlertReview.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      key: true,
      kind: true,
      note: true,
      createdAt: true,
      reviewer: { select: { id: true, displayName: true, username: true } },
    },
  });
}

export async function reviewAlert(
  ctx: ServiceCtx,
  admin: Pick<SessionUser, "id">,
  input: { key: string; kind: AlertKind; note?: string },
) {
  ctx.activity.set({ targetType: "Alert", targetId: input.key.slice(0, 200) });
  const data: Prisma.AdminAlertReviewUncheckedCreateInput = {
    key: input.key,
    kind: input.kind,
    reviewerId: admin.id,
    note: input.note?.trim() ? input.note.trim() : null,
  };
  await ctx.db.adminAlertReview.upsert({ where: { key: input.key }, create: data, update: data });
  return { key: input.key };
}
