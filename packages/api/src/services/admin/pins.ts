import { resolvePinLook } from "@bandcoin/ar-core/pin-look";
import type { ApprovalStatus, Prisma } from "@bandcoin/db";
import { AppError, ErrorCodes } from "@bandcoin/errors";

import type { Context } from "../../context";
import { statusOf } from "../artist/pins";
import { notUnlockPin } from "../catalog/unlock-pins";

/**
 * Admin › Pin review, as in Wadzzo: an artist's new pin waits (PENDING) until
 * an admin approves it; fans never see it before. Admins approve or reject in
 * bulk, move a decision back to review (the undo), and delete pins nobody collected.
 */
type ServiceCtx = Pick<Context, "db" | "activity">;

export const REVIEW_PAGE = 100;
/** Rows per page on the other admin lists (bounties, items). */
export const ADMIN_PAGE = 50;
export type PinView = "pending" | "approved" | "rejected";
export type PinFilter = { view: PinView; search?: string; cursor?: string };

const APPROVAL_OF: Record<PinView, ApprovalStatus> = {
  pending: "PENDING",
  approved: "APPROVED",
  rejected: "REJECTED",
};

function whereOf(input: PinFilter): Prisma.PinWhereInput {
  const q = input.search?.trim();
  return {
    ...notUnlockPin,
    approval: APPROVAL_OF[input.view],
    ...(q
      ? {
          OR: [
            { id: q },
            { title: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
            { artist: { name: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
}

/** Oldest first while waiting (first come, first reviewed); newest first once decided. */
export async function listPins(ctx: Pick<Context, "db">, input: PinFilter, now = new Date()) {
  const order = input.view === "pending" ? "asc" : "desc";
  const rows = await ctx.db.pin.findMany({
    where: whereOf(input),
    orderBy: [{ createdAt: order }, { id: order }],
    take: REVIEW_PAGE + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      title: true,
      description: true,
      type: true,
      imageUrl: true,
      isHidden: true,
      startsAt: true,
      endsAt: true,
      claimLimit: true,
      claimsLeft: true,
      latitude: true,
      longitude: true,
      radiusMeters: true,
      createdAt: true,
      artist: { select: { id: true, name: true, userId: true, avatarUrl: true } },
      layer: { select: { id: true, name: true, icon: true, color: true } },
      _count: { select: { spots: true } },
    },
  });
  const page = rows.slice(0, REVIEW_PAGE);
  return {
    pins: page.map((pin) => ({
      id: pin.id,
      title: pin.title,
      description: pin.description,
      type: pin.type,
      imageUrl: pin.imageUrl,
      artist: pin.artist,
      layer: pin.layer,
      spots: pin._count.spots,
      claimed: Math.max(0, pin.claimLimit - pin.claimsLeft),
      claimLimit: pin.claimLimit,
      startsAt: pin.startsAt,
      endsAt: pin.endsAt,
      latitude: pin.latitude,
      longitude: pin.longitude,
      radiusMeters: pin.radiusMeters,
      createdAt: pin.createdAt,
      timing:
        pin.endsAt < now
          ? ("ended" as const)
          : pin.startsAt > now
            ? ("upcoming" as const)
            : pin.isHidden
              ? ("paused" as const)
              : ("running" as const),
    })),
    nextCursor: rows.length > REVIEW_PAGE ? (page.at(-1)?.id ?? null) : null,
  };
}

/** How many pins are in each list, for the view chips. */
export async function pinCounts(ctx: Pick<Context, "db">) {
  const groups = await ctx.db.pin.groupBy({
    by: ["approval"],
    where: notUnlockPin,
    _count: { _all: true },
  });
  const of = (approval: ApprovalStatus) =>
    groups.find((group) => group.approval === approval)?._count._all ?? 0;
  return { pending: of("PENDING"), approved: of("APPROVED"), rejected: of("REJECTED") };
}

const logTargets = (ctx: ServiceCtx, pinIds: string[]) =>
  ctx.activity.set({ targetType: "Pin", targetId: pinIds.join(",").slice(0, 500) });

/** Approve, reject, or move back to review (PENDING, which is also the undo). */
export async function decidePins(
  ctx: ServiceCtx,
  input: { pinIds: string[]; approval: ApprovalStatus },
) {
  logTargets(ctx, input.pinIds);
  const { count } = await ctx.db.pin.updateMany({
    where: { id: { in: input.pinIds } },
    data: { approval: input.approval },
  });
  if (count === 0) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Pin not found" });
  return { count, approval: input.approval };
}

/** Deletes pins nobody collected; a collected pin can only be rejected, so fans keep their history. */
export async function deletePins(ctx: ServiceCtx, input: { pinIds: string[] }) {
  logTargets(ctx, input.pinIds);
  const collected = await ctx.db.pin.count({
    where: { id: { in: input.pinIds }, spots: { some: { claims: { some: {} } } } },
  });
  if (collected > 0)
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, {
      message:
        input.pinIds.length === 1
          ? "Fans collected this pin, so it can only be rejected."
          : `Fans collected ${collected} of these pins, so they can only be rejected.`,
    });
  const { count } = await ctx.db.pin.deleteMany({ where: { id: { in: input.pinIds } } });
  return { count };
}

/** Most pins the all-pins map draws at once */
export const MAP_PINS = 2000;

/**
 * Admin › Pin map: every artist's pins (or one artist's) on one map, with the
 * same status the artist sees. Ended pins only when asked.
 */
export async function pinsForMap(
  ctx: Pick<Context, "db">,
  input: { artistId?: string; includeEnded?: boolean },
  now = new Date(),
) {
  const rows = await ctx.db.pin.findMany({
    where: {
      ...notUnlockPin,
      ...(input.artistId ? { artistId: input.artistId } : {}),
      ...(input.includeEnded ? {} : { endsAt: { gte: now } }),
    },
    orderBy: { createdAt: "desc" },
    take: MAP_PINS,
    select: {
      id: true,
      title: true,
      type: true,
      imageUrl: true,
      approval: true,
      isHidden: true,
      startsAt: true,
      endsAt: true,
      claimLimit: true,
      claimsLeft: true,
      artist: { select: { id: true, name: true, avatarUrl: true } },
      layer: { select: { id: true, name: true, icon: true, color: true } },
      pinShape: { select: { path: true, anchor: true } },
      markerShape: true,
      pinShapeId: true,
      markerFill: true,
      markerColor: true,
      markerImageFit: true,
      markerAutoBadge: true,
      spots: {
        where: { isHidden: false },
        select: {
          id: true,
          latitude: true,
          longitude: true,
          autoCollect: true,
          _count: { select: { claims: true } },
        },
      },
    },
  });
  return {
    pins: rows.map((pin) => ({
      id: pin.id,
      title: pin.title,
      type: pin.type,
      imageUrl: pin.imageUrl,
      artist: pin.artist,
      layer: pin.layer,
      look: resolvePinLook(pin, {
        customShape: pin.pinShape,
        artistImage: pin.artist.avatarUrl,
        pinImage: pin.imageUrl,
        autoCollect: pin.spots.some((spot) => spot.autoCollect),
      }),
      startsAt: pin.startsAt,
      endsAt: pin.endsAt,
      status: statusOf(pin, now),
      collected: pin.spots.reduce((sum, spot) => sum + spot._count.claims, 0),
      spotPoints: pin.spots.map((spot) => ({
        id: spot.id,
        latitude: spot.latitude,
        longitude: spot.longitude,
        autoCollect: spot.autoCollect,
        collected: spot._count.claims,
      })),
    })),
    capped: rows.length === MAP_PINS,
  };
}
