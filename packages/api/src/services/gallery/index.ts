import type { Db } from "@actiontokens/db";
import { AppError, ErrorCodes } from "@actiontokens/errors";

import type { Context } from "../../context";
import { assertCell, assertRoom, doorCells, refuse, roomsOf } from "./rooms";
import { cellOf, isSlotId, wallSlot } from "./slots";

type ServiceCtx = Pick<Context, "db">;

const notFound = (what: string) =>
  new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: `This ${what} doesn't exist.` });

function assertSlot(slotId: string) {
  if (!isSlotId(slotId)) throw refuse("That isn't a slot in the museum.");
}

// ── Reading ────────────────────────────────────────────────────────────────

/** Approved artists, for the gallery's entrance. */
export function listGalleries(ctx: ServiceCtx) {
  return ctx.db.organization.findMany({
    where: { status: "APPROVED" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      bio: true,
      avatarUrl: true,
      gallery: { select: { musicUrl: true } },
    },
  });
}

/** One artist's whole museum (an id or a slug), with likes counted per frame and the viewer's own. */
export async function loadGallery(ctx: ServiceCtx, ref: string, viewerId?: string) {
  const organization = await ctx.db.organization.findFirst({
    where: { status: "APPROVED", OR: [{ id: ref }, { slug: ref }] },
    select: {
      id: true,
      name: true,
      slug: true,
      bio: true,
      avatarUrl: true,
      gallery: { select: { musicUrl: true, creatorTitle: true, creatorDescription: true } },
      gallerySlots: {
        select: {
          slotId: true,
          roomIndex: true,
          imageUrl: true,
          title: true,
          description: true,
          aspectRatio: true,
          photoDescription: true,
          photoDescPlacement: true,
          gridCell: true,
        },
      },
      museumRooms: {
        orderBy: { roomIndex: "asc" },
        select: { roomIndex: true, label: true, northDoorCell: true },
      },
    },
  });
  if (!organization) throw notFound("gallery");
  const [counts, mine] = await Promise.all([
    ctx.db.gallerySlotLike.groupBy({
      by: ["slotId", "roomIndex"],
      where: { organizationId: organization.id },
      _count: { _all: true },
    }),
    viewerId
      ? ctx.db.gallerySlotLike.findMany({
          where: { organizationId: organization.id, userId: viewerId },
          select: { slotId: true, roomIndex: true },
        })
      : Promise.resolve([]),
  ]);
  return {
    ...organization,
    likes: counts.map((row) => ({
      slotId: row.slotId,
      roomIndex: row.roomIndex,
      count: row._count._all,
      liked: mine.some((m) => m.slotId === row.slotId && m.roomIndex === row.roomIndex),
    })),
  };
}

// ── Frames (the artist's own) ──────────────────────────────────────────────

export type SlotInput = {
  slotId: string;
  roomIndex: number;
  imageUrl?: string;
  title?: string;
  description?: string;
  aspectRatio?: string;
  photoDescription?: string;
  photoDescPlacement?: string;
  gridCell?: number | null;
};

/** Hangs (or changes) what's in a slot. Only the fields given change. */
export async function saveSlot(ctx: ServiceCtx, organizationId: string, input: SlotInput) {
  assertSlot(input.slotId);
  await assertRoom(ctx.db, organizationId, input.roomIndex);
  if (input.gridCell != null) {
    assertCell(input.gridCell);
    if (!wallSlot(input.slotId)) throw refuse("Only front and back wall frames can be moved.");
    await assertCellFree(ctx.db, organizationId, input.roomIndex, input.slotId, input.gridCell);
  }
  const { slotId, roomIndex, ...fields } = input;
  return ctx.db.gallerySlotOverride.upsert({
    where: { organizationId_slotId_roomIndex: { organizationId, slotId, roomIndex } },
    create: { organizationId, slotId, roomIndex, ...fields },
    update: fields,
    select: { id: true },
  });
}

export async function resetSlot(
  ctx: ServiceCtx,
  organizationId: string,
  input: { slotId: string; roomIndex: number },
) {
  const { count } = await ctx.db.gallerySlotOverride.deleteMany({
    where: { organizationId, ...input },
  });
  return { reset: count };
}

export async function resetAllSlots(ctx: ServiceCtx, organizationId: string) {
  const { count } = await ctx.db.gallerySlotOverride.deleteMany({ where: { organizationId } });
  return { reset: count };
}

/** Swaps what two frames show (their positions stay). Both must have something hung. */
export async function swapSlots(
  ctx: ServiceCtx,
  organizationId: string,
  input: { slotIdA: string; slotIdB: string; roomIndex: number },
) {
  assertSlot(input.slotIdA);
  assertSlot(input.slotIdB);
  if (input.slotIdA === input.slotIdB) return { swapped: false };
  const rows = await ctx.db.gallerySlotOverride.findMany({
    where: {
      organizationId,
      roomIndex: input.roomIndex,
      slotId: { in: [input.slotIdA, input.slotIdB] },
    },
  });
  const a = rows.find((row) => row.slotId === input.slotIdA);
  const b = rows.find((row) => row.slotId === input.slotIdB);
  if (!a || !b) throw refuse("Both frames need something in them to swap.");
  const content = (row: typeof a) => ({
    imageUrl: row.imageUrl,
    title: row.title,
    description: row.description,
    aspectRatio: row.aspectRatio,
    photoDescription: row.photoDescription,
    photoDescPlacement: row.photoDescPlacement,
  });
  await ctx.db.$transaction([
    ctx.db.gallerySlotOverride.update({ where: { id: a.id }, data: content(b) }),
    ctx.db.gallerySlotOverride.update({ where: { id: b.id }, data: content(a) }),
  ]);
  return { swapped: true };
}

/**
 * A wall cell is taken by another frame on that wall (where it was moved to, or its own number
 * while it hasn't moved) or by a door.
 */
async function assertCellFree(
  db: Db,
  organizationId: string,
  roomIndex: number,
  slotId: string,
  cell: number,
) {
  const wall = wallSlot(slotId);
  if (!wall) return;
  const doors = doorCells(await roomsOf(db, organizationId), roomIndex);
  if (doors[wall.wall] === cell) throw refuse(`Cell ${cell + 1} is a door.`);
  const onWall = await db.gallerySlotOverride.findMany({
    where: { organizationId, roomIndex, slotId: { startsWith: `m-${wall.wall}-` } },
    select: { slotId: true, gridCell: true, imageUrl: true },
  });
  const taken = Array.from({ length: 4 }, (_, i) => `m-${wall.wall}-${i}`)
    .filter((id) => id !== slotId)
    .some((id) => {
      const row = onWall.find((r) => r.slotId === id);
      // A frame that never moved hangs in its own cell, but only counts if something is in it.
      return row
        ? cellOf(id, row.gridCell) === cell && (row.gridCell !== null || Boolean(row.imageUrl))
        : false;
    });
  if (taken) throw refuse("That cell already has a frame.");
}

export async function moveSlotToCell(
  ctx: ServiceCtx,
  organizationId: string,
  input: { slotId: string; targetCell: number; roomIndex: number },
) {
  assertSlot(input.slotId);
  assertCell(input.targetCell);
  if (!wallSlot(input.slotId)) throw refuse("Only front and back wall frames can be moved.");
  await assertRoom(ctx.db, organizationId, input.roomIndex);
  await assertCellFree(ctx.db, organizationId, input.roomIndex, input.slotId, input.targetCell);
  await ctx.db.gallerySlotOverride.upsert({
    where: {
      organizationId_slotId_roomIndex: {
        organizationId,
        slotId: input.slotId,
        roomIndex: input.roomIndex,
      },
    },
    create: {
      organizationId,
      slotId: input.slotId,
      roomIndex: input.roomIndex,
      gridCell: input.targetCell,
    },
    update: { gridCell: input.targetCell },
  });
  return { ok: true };
}

// ── Rooms ──────────────────────────────────────────────────────────────────

/** Whether a frame hangs on a room's back wall at this cell (a door can't go there). */
async function backWallFrameAt(db: Db, organizationId: string, roomIndex: number, cell: number) {
  const frames = await db.gallerySlotOverride.findMany({
    where: { organizationId, roomIndex, slotId: { startsWith: "m-back-" } },
    select: { slotId: true, gridCell: true, imageUrl: true },
  });
  return frames.some(
    (frame) =>
      cellOf(frame.slotId, frame.gridCell) === cell &&
      (frame.gridCell !== null || Boolean(frame.imageUrl)),
  );
}

/** Adds a room after the last, with a door to it from the last room's north wall. */
export async function addRoom(ctx: ServiceCtx, organizationId: string, northDoorCell: number) {
  assertCell(northDoorCell);
  const rooms = await ctx.db.museumRoom.findMany({
    where: { organizationId },
    orderBy: { roomIndex: "asc" },
  });
  const last = rooms.at(-1);
  const lastIndex = last?.roomIndex ?? 0;
  if (await backWallFrameAt(ctx.db, organizationId, lastIndex, northDoorCell))
    throw refuse(
      `Cell ${northDoorCell + 1} on the north wall has a frame. Move it first to place the door.`,
    );
  const nextIndex = lastIndex + 1;
  return ctx.db.$transaction(async (tx) => {
    if (last) await tx.museumRoom.update({ where: { id: last.id }, data: { northDoorCell } });
    else
      await tx.museumRoom.create({
        data: { organizationId, roomIndex: 0, label: "Room 1", northDoorCell },
      });
    return tx.museumRoom.create({
      data: {
        organizationId,
        roomIndex: nextIndex,
        label: `Room ${nextIndex + 1}`,
        northDoorCell: null,
      },
      select: { id: true, roomIndex: true },
    });
  });
}

/** Removes the last room with its frames and likes. Removing the only extra room goes back to one room. */
export async function removeRoom(ctx: ServiceCtx, organizationId: string) {
  const rooms = await ctx.db.museumRoom.findMany({
    where: { organizationId },
    orderBy: { roomIndex: "asc" },
  });
  if (rooms.length === 0) throw refuse("There's only one room.");
  const last = rooms.at(-1)!;
  const before = rooms.at(-2);
  await ctx.db.$transaction([
    ...(before
      ? [
          ctx.db.museumRoom.delete({ where: { id: last.id } }),
          ctx.db.museumRoom.update({ where: { id: before.id }, data: { northDoorCell: null } }),
          ctx.db.gallerySlotOverride.deleteMany({
            where: { organizationId, roomIndex: last.roomIndex },
          }),
          ctx.db.gallerySlotLike.deleteMany({
            where: { organizationId, roomIndex: last.roomIndex },
          }),
        ]
      : [
          // Back to the single default room: its rows go, its own frames stay.
          ctx.db.museumRoom.deleteMany({ where: { organizationId } }),
          ctx.db.gallerySlotOverride.deleteMany({
            where: { organizationId, roomIndex: { gt: 0 } },
          }),
          ctx.db.gallerySlotLike.deleteMany({ where: { organizationId, roomIndex: { gt: 0 } } }),
        ]),
  ]);
  return { ok: true };
}

export async function setRoomDoor(
  ctx: ServiceCtx,
  organizationId: string,
  input: { roomIndex: number; northDoorCell: number },
) {
  assertCell(input.northDoorCell);
  const room = await ctx.db.museumRoom.findUnique({
    where: { organizationId_roomIndex: { organizationId, roomIndex: input.roomIndex } },
    select: { id: true },
  });
  if (!room) throw notFound("room");
  const rooms = await roomsOf(ctx.db, organizationId);
  if (!rooms.some((r) => r.roomIndex === input.roomIndex + 1))
    throw refuse("Only a room with another room after it has a north door.");
  if (await backWallFrameAt(ctx.db, organizationId, input.roomIndex, input.northDoorCell))
    throw refuse(`Cell ${input.northDoorCell + 1} on the north wall has a frame. Move it first.`);
  await ctx.db.museumRoom.update({
    where: { id: room.id },
    data: { northDoorCell: input.northDoorCell },
  });
  return { ok: true };
}

export async function setRoomLabel(
  ctx: ServiceCtx,
  organizationId: string,
  input: { roomIndex: number; label: string },
) {
  const { count } = await ctx.db.museumRoom.updateMany({
    where: { organizationId, roomIndex: input.roomIndex },
    data: { label: input.label },
  });
  if (count === 0) throw notFound("room");
  return { ok: true };
}

// ── Settings and likes ─────────────────────────────────────────────────────

export function saveGallerySettings(
  ctx: ServiceCtx,
  organizationId: string,
  input: { musicUrl?: string | null; creatorTitle?: string; creatorDescription?: string },
) {
  return ctx.db.creatorGallery.upsert({
    where: { organizationId },
    create: { organizationId, ...input },
    update: input,
    select: { organizationId: true },
  });
}

/** Likes or un-likes a frame in someone's museum; returns the new state and count. */
export async function toggleLike(
  ctx: ServiceCtx,
  userId: string,
  input: { organizationId: string; slotId: string; roomIndex: number },
) {
  assertSlot(input.slotId);
  const organization = await ctx.db.organization.findFirst({
    where: { id: input.organizationId, status: "APPROVED" },
    select: { id: true },
  });
  if (!organization) throw notFound("gallery");
  await assertRoom(ctx.db, input.organizationId, input.roomIndex);
  const where = { organizationId_slotId_roomIndex_userId: { ...input, userId } };
  const existing = await ctx.db.gallerySlotLike.findUnique({ where });
  if (existing) await ctx.db.gallerySlotLike.delete({ where });
  else await ctx.db.gallerySlotLike.create({ data: { ...input, userId } });
  const count = await ctx.db.gallerySlotLike.count({
    where: {
      organizationId: input.organizationId,
      slotId: input.slotId,
      roomIndex: input.roomIndex,
    },
  });
  return { liked: !existing, count };
}
