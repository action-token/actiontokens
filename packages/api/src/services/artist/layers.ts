import type { Db } from "@bandcoin/db";
import { LAYER_ICONS, MAX_LAYERS_PER_ARTIST } from "@bandcoin/ar-core/layers";
import { AppError, ErrorCodes } from "@bandcoin/errors";

import type { Context } from "../../context";

/**
 * Map layers (plan 42). An artist makes their own: a name, an icon, a colour, up to 30. Each pin
 * or hotspot is in one layer or none. A hotspot's drops follow the hotspot's layer. Deleting a
 * layer makes what was in it regular again (the database sets the column to null).
 */
type ServiceCtx = Pick<Context, "db" | "activity">;
type ArtistRef = { id: string };

export type LayerInput = { name: string; icon: string; color: string };

const invalid = (message: string) => new AppError(ErrorCodes.VALIDATION_FAILED, { message });

function cleanLayer(input: LayerInput): LayerInput {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 32)
    throw invalid("Give the layer a name between 2 and 32 characters.");
  if (!(LAYER_ICONS as readonly string[]).includes(input.icon)) throw invalid("Pick an icon.");
  if (!/^#[0-9a-fA-F]{6}$/.test(input.color)) throw invalid("Pick a colour.");
  return { name, icon: input.icon, color: input.color };
}

/** The artist's layers by name, each with how many pins and hotspots are in it. */
export async function listLayers(ctx: Pick<Context, "db">, artist: ArtistRef) {
  const layers = await ctx.db.pinLayer.findMany({
    where: { artistId: artist.id },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      icon: true,
      color: true,
      _count: { select: { pins: true, hotspots: true } },
    },
  });
  return layers.map(({ _count, ...layer }) => ({
    ...layer,
    pins: _count.pins,
    hotspots: _count.hotspots,
  }));
}

export async function createLayer(ctx: ServiceCtx, artist: ArtistRef, input: LayerInput) {
  const data = cleanLayer(input);
  const have = await ctx.db.pinLayer.count({ where: { artistId: artist.id } });
  if (have >= MAX_LAYERS_PER_ARTIST)
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, {
      message: `You can have up to ${MAX_LAYERS_PER_ARTIST} layers. Delete one to make another.`,
    });
  const layer = await ctx.db.pinLayer.create({
    data: { ...data, artistId: artist.id },
    select: { id: true, name: true, icon: true, color: true },
  });
  ctx.activity.set({ targetType: "PinLayer", targetId: layer.id });
  return layer;
}

export async function updateLayer(
  ctx: ServiceCtx,
  artist: ArtistRef,
  input: LayerInput & { id: string },
) {
  const data = cleanLayer(input);
  const own = await ctx.db.pinLayer.findFirst({
    where: { id: input.id, artistId: artist.id },
    select: { id: true },
  });
  if (!own) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Layer not found" });
  ctx.activity.set({ targetType: "PinLayer", targetId: own.id });
  return ctx.db.pinLayer.update({
    where: { id: own.id },
    data,
    select: { id: true, name: true, icon: true, color: true },
  });
}

export async function deleteLayer(ctx: ServiceCtx, artist: ArtistRef, layerId: string) {
  const own = await ctx.db.pinLayer.findFirst({
    where: { id: layerId, artistId: artist.id },
    select: { id: true },
  });
  if (!own) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Layer not found" });
  ctx.activity.set({ targetType: "PinLayer", targetId: own.id });
  await ctx.db.pinLayer.delete({ where: { id: own.id } });
  return { layerId: own.id };
}

/**
 * Checks the layer an artist wants a pin or hotspot in. Returns what to store: `undefined` =
 * leave it alone (the input left it out), `null` = no layer, else the id. A layer that isn't the
 * artist's own is refused, unless it's `keep`, the one the row already has.
 */
export async function checkLayer(
  db: Pick<Db, "pinLayer">,
  artistId: string,
  layerId: string | null | undefined,
  keep?: string | null,
): Promise<string | null | undefined> {
  if (layerId === undefined || layerId === null) return layerId;
  if (keep && layerId === keep) return layerId;
  const layer = await db.pinLayer.findUnique({
    where: { id: layerId },
    select: { artistId: true },
  });
  if (layer?.artistId !== artistId)
    throw invalid("That map layer isn't one of yours. Pick another or choose No layer.");
  return layerId;
}
