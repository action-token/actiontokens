import type { Prisma } from "@bandcoin/db";
import { AppError, ErrorCodes } from "@bandcoin/errors";

import type { Context } from "../../context";

/**
 * Every artist's pins for /admin/pins. Pins go live without review, so the
 * admin's tool is to hide one (approval REJECTED: off the map for fans; the
 * artist can't undo it), show it again, or delete one nobody collected.
 */
type ServiceCtx = Pick<Context, "db" | "activity">;

export const ADMIN_PAGE = 50;
export type PinFilter = {
  search?: string;
  status?: "live" | "hidden" | "ended" | "upcoming";
  cursor?: string;
};

function whereOf(input: PinFilter, now: Date): Prisma.PinWhereInput {
  const q = input.search?.trim();
  return {
    ...(input.status === "hidden" ? { approval: "REJECTED" } : {}),
    ...(input.status === "live"
      ? { approval: "APPROVED", startsAt: { lte: now }, endsAt: { gte: now } }
      : {}),
    ...(input.status === "ended" ? { endsAt: { lt: now } } : {}),
    ...(input.status === "upcoming" ? { startsAt: { gt: now } } : {}),
    ...(q
      ? {
          OR: [
            { id: q },
            { title: { contains: q, mode: "insensitive" } },
            { artist: { name: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
}

export async function listPins(ctx: Pick<Context, "db">, input: PinFilter, now = new Date()) {
  const rows = await ctx.db.pin.findMany({
    where: whereOf(input, now),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: ADMIN_PAGE + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
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
      latitude: true,
      longitude: true,
      createdAt: true,
      artist: { select: { id: true, name: true, userId: true } },
      _count: { select: { spots: true } },
    },
  });
  const page = rows.slice(0, ADMIN_PAGE);
  return {
    pins: page.map((pin) => ({
      id: pin.id,
      title: pin.title,
      type: pin.type,
      imageUrl: pin.imageUrl,
      artist: pin.artist,
      spots: pin._count.spots,
      claimed: Math.max(0, pin.claimLimit - pin.claimsLeft),
      claimLimit: pin.claimLimit,
      startsAt: pin.startsAt,
      endsAt: pin.endsAt,
      latitude: pin.latitude,
      longitude: pin.longitude,
      createdAt: pin.createdAt,
      status:
        pin.approval === "REJECTED"
          ? ("hidden" as const)
          : pin.endsAt < now
            ? ("ended" as const)
            : pin.startsAt > now
              ? ("upcoming" as const)
              : pin.isHidden
                ? ("paused" as const)
                : ("live" as const),
    })),
    nextCursor: rows.length > ADMIN_PAGE ? (page.at(-1)?.id ?? null) : null,
  };
}

async function loadPin(ctx: ServiceCtx, pinId: string) {
  const pin = await ctx.db.pin.findUnique({
    where: { id: pinId },
    select: { id: true, approval: true },
  });
  if (!pin) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Pin not found" });
  ctx.activity.set({ targetType: "Pin", targetId: pin.id });
  return pin;
}

export async function setPinHidden(ctx: ServiceCtx, input: { pinId: string; hidden: boolean }) {
  const pin = await loadPin(ctx, input.pinId);
  await ctx.db.pin.update({
    where: { id: pin.id },
    data: { approval: input.hidden ? "REJECTED" : "APPROVED" },
  });
  return { pinId: pin.id, hidden: input.hidden };
}

/** Deletes a pin nobody collected; one with claims can only be hidden, so fans keep their history. */
export async function deletePin(ctx: ServiceCtx, input: { pinId: string }) {
  const pin = await loadPin(ctx, input.pinId);
  const claims = await ctx.db.pinClaim.count({ where: { spot: { pinId: pin.id } } });
  if (claims > 0)
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, {
      message: `Fans collected this pin ${claims} ${claims === 1 ? "time" : "times"}, so it can only be hidden.`,
    });
  await ctx.db.pin.delete({ where: { id: pin.id } });
  return { pinId: pin.id, deleted: true };
}
