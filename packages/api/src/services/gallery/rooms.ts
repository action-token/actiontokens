import type { Db } from "@actiontokens/db";
import { AppError, ErrorCodes } from "@actiontokens/errors";

import { WALL_CELLS } from "./slots";

type Rooms = { roomIndex: number; northDoorCell: number | null }[];

export const refuse = (message: string) =>
  new AppError(ErrorCodes.PRECONDITION_NOT_MET, { message });

/** The room rows, in order. Empty means the single default room (index 0). */
export const roomsOf = (db: Db, organizationId: string): Promise<Rooms> =>
  db.museumRoom.findMany({
    where: { organizationId },
    orderBy: { roomIndex: "asc" },
    select: { roomIndex: true, northDoorCell: true },
  });

/** Room 0 always exists; any other index needs its row. */
export async function assertRoom(db: Db, organizationId: string, roomIndex: number) {
  if (roomIndex === 0) return;
  const room = await db.museumRoom.findUnique({
    where: { organizationId_roomIndex: { organizationId, roomIndex } },
    select: { id: true },
  });
  if (!room) throw refuse("That room doesn't exist.");
}

/**
 * Cells a wall can't hold a frame in because a door is there: the back wall's north door, and the
 * front wall's door back to the previous room (that room's north door).
 */
export function doorCells(
  rooms: Rooms,
  roomIndex: number,
): { front: number | null; back: number | null } {
  const here = rooms.find((room) => room.roomIndex === roomIndex);
  const before = roomIndex > 0 ? rooms.find((room) => room.roomIndex === roomIndex - 1) : undefined;
  return { front: before?.northDoorCell ?? null, back: here?.northDoorCell ?? null };
}

export const assertCell = (cell: number) => {
  if (!Number.isInteger(cell) || cell < 0 || cell >= WALL_CELLS)
    throw refuse(`A wall has ${WALL_CELLS} cells, numbered 0 to ${WALL_CELLS - 1}.`);
};
