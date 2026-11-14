import { describe, expect, it, vi } from "vitest";

import {
  archiveShape,
  createShape,
  deleteShape,
  listShapes,
  MAX_SHAPES_PER_ARTIST,
  shapeUsage,
  updateShape,
} from "../services/artist/shapes";

const artist = { id: "a1" };
const input = { name: "Mascot", path: "M10 10 L90 10 L50 90 Z", anchor: "bottom" as const };

function setup(opts: { have?: number; pins?: number; hotspots?: number; templates?: number } = {}) {
  const db = {
    pinShape: {
      count: vi.fn().mockResolvedValue(opts.have ?? 0),
      create: vi.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: "S-new", ...data }),
      ),
      findFirst: vi.fn(({ where }: { where: { id: string; artistId: string } }) =>
        Promise.resolve(where.id === "S1" && where.artistId === "a1" ? { id: "S1" } : null),
      ),
      findMany: vi.fn().mockResolvedValue([{ id: "S1" }]),
      update: vi.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: "S1", ...data }),
      ),
      delete: vi.fn().mockResolvedValue({}),
    },
    pin: { count: vi.fn().mockResolvedValue(opts.pins ?? 0) },
    hotspot: { count: vi.fn().mockResolvedValue(opts.hotspots ?? 0) },
    pinTemplate: { count: vi.fn().mockResolvedValue(opts.templates ?? 0) },
  };
  return { ctx: { db, activity: { set: vi.fn(), facts: vi.fn() } } as never, db };
}

describe("an artist's own shapes", () => {
  it("lists the live ones by default, and the archived ones on request", async () => {
    const { ctx, db } = setup();
    await listShapes(ctx, artist);
    expect(db.pinShape.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { artistId: "a1", archived: false } }),
    );
    await listShapes(ctx, artist, { archived: true });
    expect(db.pinShape.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { artistId: "a1", archived: true } }),
    );
  });

  it("saves a shape, and stops at the limit", async () => {
    const { ctx, db } = setup();
    await createShape(ctx, artist, input);
    expect(db.pinShape.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { artistId: "a1", ...input } }),
    );
    const full = setup({ have: MAX_SHAPES_PER_ARTIST });
    await expect(createShape(full.ctx, artist, input)).rejects.toThrow(/up to 100 shapes/);
    expect(full.db.pinShape.create).not.toHaveBeenCalled();
  });

  it("only touches the artist's own", async () => {
    const { ctx } = setup();
    await expect(updateShape(ctx, artist, { id: "S-other", name: "X" })).rejects.toThrow(
      /not found/i,
    );
    await expect(archiveShape(ctx, artist, { id: "S-other", archived: true })).rejects.toThrow(
      /not found/i,
    );
    await expect(deleteShape(ctx, artist, "S-other")).rejects.toThrow(/not found/i);
    await expect(shapeUsage(ctx, artist, "S-other")).rejects.toThrow(/not found/i);
  });

  it("changes a shape in place, and archives or brings it back", async () => {
    const { ctx, db } = setup();
    await updateShape(ctx, artist, { id: "S1", name: "Renamed" });
    expect(db.pinShape.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { name: "Renamed", path: undefined, anchor: undefined } }),
    );
    await archiveShape(ctx, artist, { id: "S1", archived: true });
    expect(db.pinShape.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { archived: true } }),
    );
  });

  it("counts what draws with a shape", async () => {
    const { ctx } = setup({ pins: 3, hotspots: 1, templates: 2 });
    expect(await shapeUsage(ctx, artist, "S1")).toEqual({
      pins: 3,
      hotspots: 1,
      templates: 2,
      total: 6,
    });
  });

  it("deletes a shape nothing uses, but not one in use", async () => {
    const free = setup();
    await deleteShape(free.ctx, artist, "S1");
    expect(free.db.pinShape.delete).toHaveBeenCalledWith({ where: { id: "S1" } });
    const used = setup({ templates: 1 });
    await expect(deleteShape(used.ctx, artist, "S1")).rejects.toThrow(/in use/);
    expect(used.db.pinShape.delete).not.toHaveBeenCalled();
  });
});
