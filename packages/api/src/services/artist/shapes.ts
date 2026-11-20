import { AppError, ErrorCodes } from "@actiontokens/errors";

import type { Context } from "../../context";

/**
 * An artist's own pin shapes (plan 43; the built-in ones live in `@actiontokens/ar-core/pin-look`).
 * A shape in use is archived rather than deleted, so its pins keep drawing it. The outline is
 * checked by the router (`shapePathSchema`) before it gets here.
 */
type ServiceCtx = Pick<Context, "db" | "activity">;
type ArtistRef = { id: string };

/** An artist can keep this many shapes (archived ones don't count). */
export const MAX_SHAPES_PER_ARTIST = 100;

const SELECT = {
  id: true,
  name: true,
  path: true,
  anchor: true,
  archived: true,
  updatedAt: true,
} as const;

export type ShapeInput = { name: string; path: string; anchor: "center" | "bottom" };

export const listShapes = (
  ctx: Pick<Context, "db">,
  artist: ArtistRef,
  options: { archived?: boolean } = {},
) =>
  ctx.db.pinShape.findMany({
    where: { artistId: artist.id, archived: options.archived ?? false },
    select: SELECT,
    orderBy: { updatedAt: "desc" },
  });

/** Loads a shape and checks it is the artist's own. */
async function ownShape(ctx: ServiceCtx, artist: ArtistRef, id: string) {
  const shape = await ctx.db.pinShape.findFirst({
    where: { id, artistId: artist.id },
    select: { id: true },
  });
  if (!shape) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Shape not found" });
  ctx.activity.set({ targetType: "PinShape", targetId: shape.id });
  return shape;
}

/** How many pins, hotspots and templates draw with a shape. */
export async function shapeUsage(ctx: ServiceCtx, artist: ArtistRef, id: string) {
  const shape = await ownShape(ctx, artist, id);
  const [pins, hotspots, templates] = await Promise.all([
    ctx.db.pin.count({ where: { pinShapeId: shape.id } }),
    ctx.db.hotspot.count({ where: { pinShapeId: shape.id, isHidden: false } }),
    ctx.db.pinTemplate.count({
      where: { artistId: artist.id, data: { path: ["look", "shape"], equals: shape.id } },
    }),
  ]);
  return { pins, hotspots, templates, total: pins + hotspots + templates };
}

export async function createShape(ctx: ServiceCtx, artist: ArtistRef, input: ShapeInput) {
  const count = await ctx.db.pinShape.count({ where: { artistId: artist.id, archived: false } });
  if (count >= MAX_SHAPES_PER_ARTIST)
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, {
      message: `You can keep up to ${MAX_SHAPES_PER_ARTIST} shapes. Archive some you no longer use.`,
    });
  const shape = await ctx.db.pinShape.create({
    data: { artistId: artist.id, name: input.name, path: input.path, anchor: input.anchor },
    select: SELECT,
  });
  ctx.activity.set({ targetType: "PinShape", targetId: shape.id });
  return shape;
}

/** Changes the shape in place: every pin and hotspot using it changes too. */
export async function updateShape(
  ctx: ServiceCtx,
  artist: ArtistRef,
  input: Partial<ShapeInput> & { id: string },
) {
  const shape = await ownShape(ctx, artist, input.id);
  return ctx.db.pinShape.update({
    where: { id: shape.id },
    data: { name: input.name, path: input.path, anchor: input.anchor },
    select: SELECT,
  });
}

/** Hides a shape from the picker (pins already using it keep it), or brings it back. */
export async function archiveShape(
  ctx: ServiceCtx,
  artist: ArtistRef,
  input: { id: string; archived: boolean },
) {
  const shape = await ownShape(ctx, artist, input.id);
  return ctx.db.pinShape.update({
    where: { id: shape.id },
    data: { archived: input.archived },
    select: SELECT,
  });
}

/** Deletes a shape nothing uses; a shape in use must be archived instead. */
export async function deleteShape(ctx: ServiceCtx, artist: ArtistRef, id: string) {
  const usage = await shapeUsage(ctx, artist, id);
  if (usage.total > 0)
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, {
      message: "This shape is in use. Archive it instead.",
    });
  await ctx.db.pinShape.delete({ where: { id } });
  return { id };
}
