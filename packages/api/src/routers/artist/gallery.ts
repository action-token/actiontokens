import { z } from "zod";

import {
  addRoom,
  moveSlotToCell,
  removeRoom,
  resetAllSlots,
  resetSlot,
  saveGallerySettings,
  saveSlot,
  setRoomDoor,
  setRoomLabel,
  swapSlots,
} from "../../services/gallery";
import { ASPECT_RATIOS, DESC_PLACEMENTS, isSlotId } from "../../services/gallery/slots";
import { artistProcedure, createRouter } from "../../trpc";

export const SLOT_ID = z.string().refine(isSlotId, "That isn't a slot in the museum");
export const ROOM_INDEX = z.number().int().min(0).max(50).default(0);
const CELL = z.number().int().min(0).max(3);
const https = z.string().url().max(2000).startsWith("https://", "Use a secure (https) link");

/** The artist's own museum: frames, rooms, music. Fans see it through `gallery.*` on the fan app. */
export const galleryEditRouter = createRouter({
  /** Hangs or changes what's in a slot; only the fields sent change. */
  saveSlot: artistProcedure
    .input(
      z.object({
        slotId: SLOT_ID,
        roomIndex: ROOM_INDEX,
        imageUrl: https.optional(),
        title: z.string().max(20).optional(),
        description: z.string().max(7000).optional(),
        aspectRatio: z.enum(ASPECT_RATIOS).optional(),
        photoDescription: z.string().max(5000).optional(),
        photoDescPlacement: z.enum(DESC_PLACEMENTS).optional(),
        gridCell: CELL.nullable().optional(),
      }),
    )
    .mutation(({ ctx, input }) => saveSlot(ctx, ctx.artist.id, input)),

  resetSlot: artistProcedure
    .input(z.object({ slotId: SLOT_ID, roomIndex: ROOM_INDEX }))
    .mutation(({ ctx, input }) => resetSlot(ctx, ctx.artist.id, input)),
  resetAll: artistProcedure.mutation(({ ctx }) => resetAllSlots(ctx, ctx.artist.id)),
  swapSlots: artistProcedure
    .input(z.object({ slotIdA: SLOT_ID, slotIdB: SLOT_ID, roomIndex: ROOM_INDEX }))
    .mutation(({ ctx, input }) => swapSlots(ctx, ctx.artist.id, input)),
  moveSlot: artistProcedure
    .input(z.object({ slotId: SLOT_ID, targetCell: CELL, roomIndex: ROOM_INDEX }))
    .mutation(({ ctx, input }) => moveSlotToCell(ctx, ctx.artist.id, input)),

  addRoom: artistProcedure
    .input(z.object({ northDoorCell: CELL.default(3) }))
    .mutation(({ ctx, input }) => addRoom(ctx, ctx.artist.id, input.northDoorCell)),
  removeRoom: artistProcedure.mutation(({ ctx }) => removeRoom(ctx, ctx.artist.id)),
  setRoomDoor: artistProcedure
    .input(z.object({ roomIndex: z.number().int().min(0).max(50), northDoorCell: CELL }))
    .mutation(({ ctx, input }) => setRoomDoor(ctx, ctx.artist.id, input)),
  setRoomLabel: artistProcedure
    .input(
      z.object({ roomIndex: z.number().int().min(0).max(50), label: z.string().trim().max(30) }),
    )
    .mutation(({ ctx, input }) => setRoomLabel(ctx, ctx.artist.id, input)),

  saveSettings: artistProcedure
    .input(
      z.object({
        musicUrl: https.nullable().optional(),
        creatorTitle: z.string().max(100).optional(),
        creatorDescription: z.string().max(5000).optional(),
      }),
    )
    .mutation(({ ctx, input }) => saveGallerySettings(ctx, ctx.artist.id, input)),
});
