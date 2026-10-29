import type { MuralRejectReason, MuralStatus, Prisma } from "@bandcoin/db";
import type { Db } from "@bandcoin/db";
import { distanceMeters } from "@bandcoin/ar-core/ar/geo";
import { AppError, ErrorCodes } from "@bandcoin/errors";

import type { Context } from "../../context";
import { boxAround, creditCoins, getMuralSettings } from "../ar/murals";
import { SCREEN_OBJECTS, type VisionReport } from "../ar/vision";
import { invalid } from "../artist/items";

/**
 * Mural review. Fans discover murals with the AR camera; this is where an
 * admin approves one (it shows on every map), rejects it, fixes its name or
 * cover, merges a duplicate, and sets the coin rules.
 *
 * Rejecting as FRAUD takes back what each person earned from that mural,
 * never below their balance. Moving it out of FRAUD gives back exactly what
 * was taken, so an undo is exact.
 */
type ServiceCtx = Pick<Context, "db" | "activity">;
type Tx = Prisma.TransactionClient;
type Decision = "PENDING" | "APPROVED" | "REJECTED";

const NEW_ACCOUNT_DAYS = 7;
const QUICK_CONFIRM_MS = 2 * 60_000;
export const DUPLICATE_RADIUS_M = 50;

type Vision = Partial<VisionReport> & { clip?: { score: number }[] };

const at = (m: { latitude: number; longitude: number }) => ({ lat: m.latitude, lng: m.longitude });
const isNewAccount = (joined: Date | null | undefined, now = Date.now()) =>
  Boolean(joined && now - joined.getTime() < NEW_ACCOUNT_DAYS * 86_400_000);

/** Something Vision saw but didn't reject on: a possible screen, or weak art scores. Worth a human look. */
export function borderline(vision: unknown) {
  const v = (vision ?? {}) as Vision;
  if (v.skipped) return false;
  const screen = (v.screens ?? []).some((object) =>
    SCREEN_OBJECTS.includes(object.name.toLowerCase()),
  );
  const weakArt = (v.clip ?? []).every((entry) => entry.score < 0.7);
  return screen || weakArt;
}

const finder = {
  select: { id: true, username: true, displayName: true, avatarUrl: true, createdAt: true },
} as const;
const nameOf = (user: { username: string | null; displayName: string | null }) =>
  user.displayName ?? user.username ?? "Someone";

export async function muralCounts(ctx: Pick<ServiceCtx, "db">) {
  const rows = await ctx.db.mural.groupBy({
    by: ["status"],
    where: { mergedIntoId: null },
    _count: { _all: true },
  });
  const counts: Record<MuralStatus, number> = {
    DISCOVERED: 0,
    PENDING: 0,
    APPROVED: 0,
    REJECTED: 0,
  };
  for (const row of rows) counts[row.status] = row._count._all;
  return counts;
}

export async function listMurals(ctx: Pick<ServiceCtx, "db">, status: MuralStatus) {
  const settings = await getMuralSettings(ctx.db);
  const murals = await ctx.db.mural.findMany({
    where: { status, mergedIntoId: null },
    orderBy: { updatedAt: status === "PENDING" ? "asc" : "desc" },
    take: 500,
    include: {
      scans: {
        where: { discoveryRank: { not: null } },
        orderBy: { discoveryRank: "asc" },
        select: { createdAt: true, discoveryRank: true, vision: true, user: finder },
      },
    },
  });
  const live = await ctx.db.mural.findMany({
    where: { mergedIntoId: null, status: { not: "REJECTED" } },
    select: { id: true, latitude: true, longitude: true },
  });

  const now = Date.now();
  return {
    confirmationsNeeded: settings.confirmationsNeeded,
    murals: murals.map((mural) => {
      const times = mural.scans.map((scan) => scan.createdAt.getTime()).sort((a, b) => a - b);
      return {
        id: mural.id,
        title: mural.title ?? mural.autoTitle,
        autoTitled: !mural.title,
        artistName: mural.artistName,
        coverUrl: mural.coverUrl,
        status: mural.status,
        rejectReason: mural.rejectReason,
        distinctScanners: mural.distinctScanners,
        scanCount: mural.scanCount,
        createdAt: mural.createdAt,
        finders: mural.scans.map((scan) => ({
          id: scan.user.id,
          name: nameOf(scan.user),
          image: scan.user.avatarUrl,
          rank: scan.discoveryRank,
        })),
        flags: {
          newAccounts: mural.scans.filter((scan) => isNewAccount(scan.user.createdAt, now)).length,
          quickConfirm: times.some((time, i) => i > 0 && time - times[i - 1]! < QUICK_CONFIRM_MS),
          borderline: mural.scans.some((scan) => borderline(scan.vision)),
          duplicates: live.filter(
            (other) =>
              other.id !== mural.id && distanceMeters(at(mural), at(other)) <= DUPLICATE_RADIUS_M,
          ).length,
        },
      };
    }),
  };
}

export async function getMural(ctx: Pick<ServiceCtx, "db">, muralId: string) {
  const mural = await ctx.db.mural.findUnique({
    where: { id: muralId },
    include: {
      discoverer: finder,
      scans: { orderBy: { createdAt: "asc" }, include: { user: finder } },
    },
  });
  if (!mural) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Mural not found" });

  const nearby = await ctx.db.mural.findMany({
    where: {
      id: { not: mural.id },
      mergedIntoId: null,
      ...boxAround(mural.latitude, mural.longitude, DUPLICATE_RADIUS_M),
    },
    select: {
      id: true,
      title: true,
      autoTitle: true,
      coverUrl: true,
      status: true,
      latitude: true,
      longitude: true,
      scanCount: true,
    },
  });
  const paid = await ctx.db.coinLedgerEntry.aggregate({
    where: { muralId: mural.id, amount: { gt: 0 } },
    _sum: { amount: true },
  });

  const { scans, discoverer, ...rest } = mural;
  return {
    ...rest,
    title: mural.title,
    discoverer: { id: discoverer.id, name: nameOf(discoverer) },
    coinsPaid: paid._sum.amount ?? 0,
    scans: scans.map((scan) => ({
      id: scan.id,
      createdAt: scan.createdAt,
      keyframes: scan.keyframes,
      platform: scan.platform,
      latitude: scan.latitude,
      longitude: scan.longitude,
      accuracyM: scan.accuracyM,
      discoveryRank: scan.discoveryRank,
      borderline: borderline(scan.vision),
      newAccount: isNewAccount(scan.user.createdAt),
      labels: ((scan.vision ?? {}) as Vision).labels ?? [],
      user: { id: scan.user.id, name: nameOf(scan.user), image: scan.user.avatarUrl },
    })),
    duplicates: nearby
      .map((other) => ({
        id: other.id,
        title: other.title ?? other.autoTitle,
        coverUrl: other.coverUrl,
        status: other.status,
        scanCount: other.scanCount,
        distanceM: Math.round(distanceMeters(at(mural), at(other))),
      }))
      .filter((other) => other.distanceM <= DUPLICATE_RADIUS_M),
  };
}

/** What each person still holds from this mural (earned, minus anything revoked or restored). */
async function coinPosition(db: Db | Tx, muralId: string) {
  const rows = await db.coinLedgerEntry.groupBy({
    by: ["userId", "reason"],
    where: { muralId },
    _sum: { amount: true },
  });
  const byUser = new Map<string, { userId: string; earned: number; net: number }>();
  for (const row of rows) {
    const position = byUser.get(row.userId) ?? { userId: row.userId, earned: 0, net: 0 };
    const amount = row._sum.amount ?? 0;
    if (row.reason === "MURAL_SCAN" || row.reason === "MURAL_DISCOVERY") position.earned += amount;
    position.net += amount;
    byUser.set(row.userId, position);
  }
  return [...byUser.values()];
}

/** Coins a FRAUD rejection would take back, for the confirm dialog. */
export async function revokePreview(ctx: Pick<ServiceCtx, "db">, muralId: string) {
  const held = (await coinPosition(ctx.db, muralId)).filter((position) => position.net > 0);
  return { users: held.length, coins: held.reduce((sum, position) => sum + position.net, 0) };
}

/** FRAUD: take back each person's remaining coins from the mural, limited to what their balance holds. */
async function revoke(tx: Tx, muralId: string) {
  let users = 0;
  let coins = 0;
  for (const position of await coinPosition(tx, muralId)) {
    if (position.net <= 0) continue;
    const balance = await tx.coinBalance.findUnique({ where: { userId: position.userId } });
    const take = Math.min(position.net, Math.max(0, balance?.balance ?? 0));
    // Only what is actually taken moves the balance; a restore gives back exactly that. The shortfall is noted, not owed.
    await creditCoins(tx, {
      userId: position.userId,
      amount: -take,
      reason: "MURAL_REVOKE",
      muralId,
      note:
        take < position.net
          ? `Rejected as fraud (balance covered ${take} of ${position.net})`
          : "Rejected as fraud",
    });
    if (take < position.net)
      await tx.coinLedgerEntry.create({
        data: {
          userId: position.userId,
          amount: 0,
          reason: "MURAL_REVOKE",
          muralId,
          note: `Uncollectable ${position.net - take}`,
        },
      });
    users += 1;
    coins += take;
  }
  return { users, coins };
}

/** Undo of a FRAUD reject: give back what was actually taken. */
async function restore(tx: Tx, muralId: string) {
  for (const position of await coinPosition(tx, muralId)) {
    const taken = position.earned - position.net;
    if (taken > 0)
      await creditCoins(tx, {
        userId: position.userId,
        amount: taken,
        reason: "ADMIN_ADJUST",
        muralId,
        note: "Restored: fraud rejection undone",
      });
  }
}

export type DecideInput = { muralId: string; status: Decision; reason?: MuralRejectReason };

export async function decideMural(ctx: ServiceCtx & { adminId: string }, input: DecideInput) {
  if (input.status === "REJECTED" && !input.reason) throw invalid("Pick a reason for rejecting.");
  ctx.activity.set({ targetType: "Mural", targetId: input.muralId });
  return ctx.db.$transaction(
    async (tx) => {
      const mural = await tx.mural.findUnique({
        where: { id: input.muralId },
        select: { status: true, rejectReason: true, mergedIntoId: true },
      });
      if (!mural || mural.mergedIntoId)
        throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Mural not found" });
      const wasFraud = mural.status === "REJECTED" && mural.rejectReason === "FRAUD";
      const toFraud = input.status === "REJECTED" && input.reason === "FRAUD";
      if (wasFraud && !toFraud) await restore(tx, input.muralId);
      const revoked =
        toFraud && !wasFraud ? await revoke(tx, input.muralId) : { users: 0, coins: 0 };
      const back = input.status === "PENDING";
      await tx.mural.update({
        where: { id: input.muralId },
        data: {
          status: input.status,
          rejectReason: input.status === "REJECTED" ? input.reason : null,
          decidedAt: back ? null : new Date(),
          decidedById: back ? null : ctx.adminId,
        },
      });
      return { revoked };
    },
    { timeout: 30_000 },
  );
}

export type EditMuralInput = {
  muralId: string;
  title: string | null;
  artistName: string | null;
  coverUrl?: string;
};

/** An empty title goes back to the auto title; an empty artist clears it. The cover has to be one of the mural's own scan photos. */
export async function editMural(ctx: ServiceCtx, input: EditMuralInput) {
  const title = input.title?.trim() || null;
  const artistName = input.artistName?.trim() || null;
  if ((title?.length ?? 0) > 80 || (artistName?.length ?? 0) > 80)
    throw invalid("Keep the title and artist under 80 characters.");
  ctx.activity.set({ targetType: "Mural", targetId: input.muralId });
  const mural = await ctx.db.mural.findUnique({
    where: { id: input.muralId },
    select: { id: true },
  });
  if (!mural) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Mural not found" });
  if (input.coverUrl) {
    const own = await ctx.db.muralScan.findFirst({
      where: { muralId: mural.id, keyframes: { has: input.coverUrl } },
      select: { id: true },
    });
    if (!own) throw invalid("Pick a photo from this mural's scans.");
  }
  await ctx.db.mural.update({
    where: { id: mural.id },
    data: { title, artistName, ...(input.coverUrl ? { coverUrl: input.coverUrl } : {}) },
  });
  return { muralId: mural.id };
}

/** Folds a duplicate into the record that stays: scans, embeddings and coins move across. */
export async function mergeMurals(ctx: ServiceCtx, input: { fromId: string; intoId: string }) {
  if (input.fromId === input.intoId) throw invalid("Pick a different mural.");
  ctx.activity.set({ targetType: "Mural", targetId: input.fromId });
  return ctx.db.$transaction(async (tx) => {
    const settings = await getMuralSettings(tx);
    const [from, into] = await Promise.all([
      tx.mural.findUnique({ where: { id: input.fromId } }),
      tx.mural.findUnique({ where: { id: input.intoId } }),
    ]);
    if (!from || !into || from.mergedIntoId || into.mergedIntoId)
      throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Mural not found" });

    await tx.muralScan.updateMany({ where: { muralId: from.id }, data: { muralId: into.id } });
    await tx.muralEmbedding.updateMany({ where: { muralId: from.id }, data: { muralId: into.id } });
    await tx.coinLedgerEntry.updateMany({
      where: { muralId: from.id },
      data: { muralId: into.id },
    });

    const scanners = await tx.muralScan.findMany({
      where: { muralId: into.id },
      distinct: ["userId"],
      select: { userId: true },
    });
    const scanCount = await tx.muralScan.count({ where: { muralId: into.id } });
    const promote = into.status === "DISCOVERED" && scanners.length >= settings.confirmationsNeeded;
    await tx.mural.update({
      where: { id: into.id },
      data: {
        distinctScanners: scanners.length,
        scanCount,
        title: into.title ?? from.title,
        artistName: into.artistName ?? from.artistName,
        ...(promote ? { status: "PENDING" } : {}),
      },
    });
    await tx.mural.update({
      where: { id: from.id },
      data: { mergedIntoId: into.id, distinctScanners: 0, scanCount: 0 },
    });
    return { intoId: into.id };
  });
}

export type MuralSettingsInput = {
  coinsPerScan: number;
  discoveryBonus: number;
  dailyScansPerMural: number;
  confirmationsNeeded: number;
};

const SETTING_LIMITS: Record<keyof MuralSettingsInput, [number, number, string]> = {
  coinsPerScan: [0, 10_000, "Coins per scan"],
  discoveryBonus: [0, 100_000, "Discovery bonus"],
  dailyScansPerMural: [1, 50, "Scans per mural per day"],
  confirmationsNeeded: [1, 20, "Finders before review"],
};

export async function updateMuralSettings(
  ctx: ServiceCtx & { adminId: string },
  input: MuralSettingsInput,
) {
  for (const [key, [min, max, label]] of Object.entries(SETTING_LIMITS)) {
    const value = input[key as keyof MuralSettingsInput];
    if (!Number.isInteger(value) || value < min || value > max)
      throw invalid(
        `${label} must be a whole number from ${min} to ${max.toLocaleString("en-US")}.`,
      );
  }
  ctx.activity.set({ targetType: "MuralSettings", targetId: "1" });
  return ctx.db.muralSettings.upsert({
    where: { id: 1 },
    update: { ...input, updatedById: ctx.adminId },
    create: { id: 1, ...input, updatedById: ctx.adminId },
  });
}
