import { describe, expect, it, vi } from "vitest";

import { MAX_TEMPLATES_PER_ARTIST } from "@bandcoin/ar-core/pin-template";

import {
  createTemplate,
  deleteTemplate,
  duplicateTemplate,
  getTemplate,
  listTemplates,
  updateTemplate,
} from "../services/artist/templates";

const artist = { id: "a1" };
const now = new Date("2026-11-13T10:00:00Z");

const row = (over: Record<string, unknown> = {}) => ({
  id: "T1",
  name: "Weekend drop",
  formType: "PIN",
  data: { title: "Free coffee", spotCount: "lots", location: { lat: 23.8, lng: 90.4 } },
  schemaVersion: 1,
  hasLocation: true,
  createdAt: now,
  updatedAt: now,
  ...over,
});

function setup(opts: { have?: number; rows?: ReturnType<typeof row>[] } = {}) {
  const rows = opts.rows ?? [row()];
  const db = {
    pinTemplate: {
      count: vi.fn().mockResolvedValue(opts.have ?? 0),
      findMany: vi.fn().mockResolvedValue(rows),
      findFirst: vi.fn(({ where }: { where: { id: string; artistId: string } }) =>
        Promise.resolve(
          rows.find((entry) => entry.id === where.id && where.artistId === "a1") ?? null,
        ),
      ),
      create: vi.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...row(), id: "T-new", ...data }),
      ),
      update: vi.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...row(), ...data }),
      ),
      delete: vi.fn().mockResolvedValue({}),
    },
  };
  return { ctx: { db, activity: { set: vi.fn(), facts: vi.fn() } } as never, db };
}

describe("pin templates", () => {
  it("lists them newest first and opens each leniently (a broken field is dropped)", async () => {
    const { ctx, db } = setup();
    const [template] = await listTemplates(ctx, artist, "PIN");
    expect(db.pinTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { artistId: "a1", formType: "PIN" },
        orderBy: { updatedAt: "desc" },
      }),
    );
    expect(template?.data).toEqual({ title: "Free coffee", location: { lat: 23.8, lng: 90.4 } });
  });

  it("saves a template, working out whether it carries a location", async () => {
    const { ctx, db } = setup();
    await createTemplate(ctx, artist, {
      name: "Coffee",
      formType: "PIN",
      data: { title: "Free coffee", location: { lat: 1, lng: 2 } },
    });
    expect(db.pinTemplate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ artistId: "a1", formType: "PIN", hasLocation: true }),
      }),
    );
    await createTemplate(ctx, artist, { name: "Bare", formType: "PIN", data: {} });
    expect(db.pinTemplate.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ hasLocation: false }) }),
    );
  });

  it("refuses data that doesn't fit its kind, and stops at the limit", async () => {
    const { ctx, db } = setup();
    await expect(
      createTemplate(ctx, artist, {
        name: "X",
        formType: "PIN",
        data: { location: { lat: 999, lng: 0 } },
      }),
    ).rejects.toThrow();
    expect(db.pinTemplate.create).not.toHaveBeenCalled();
    const full = setup({ have: MAX_TEMPLATES_PER_ARTIST });
    await expect(
      createTemplate(full.ctx, artist, { name: "X", formType: "PIN", data: {} }),
    ).rejects.toThrow(/up to 200 templates/);
  });

  it("renames, replaces the values, and keeps the kind", async () => {
    const { ctx, db } = setup();
    await updateTemplate(ctx, artist, { id: "T1", name: "Renamed" });
    expect(db.pinTemplate.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { name: "Renamed" } }),
    );
    await updateTemplate(ctx, artist, { id: "T1", data: { title: "New", radiusMeters: 40 } });
    expect(db.pinTemplate.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ hasLocation: false, schemaVersion: 1 }),
      }),
    );
  });

  it("copies a template, and deletes one", async () => {
    const { ctx, db } = setup();
    await duplicateTemplate(ctx, artist, "T1");
    expect(db.pinTemplate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: "Weekend drop (copy)", artistId: "a1" }),
      }),
    );
    await deleteTemplate(ctx, artist, "T1");
    expect(db.pinTemplate.delete).toHaveBeenCalledWith({ where: { id: "T1" } });
  });

  it("only touches the artist's own", async () => {
    const { ctx } = setup();
    for (const run of [
      () => getTemplate(ctx, { id: "a2" }, "T1"),
      () => updateTemplate(ctx, { id: "a2" }, { id: "T1", name: "X" }),
      () => duplicateTemplate(ctx, { id: "a2" }, "T1"),
      () => deleteTemplate(ctx, { id: "a2" }, "T1"),
    ])
      await expect(run()).rejects.toThrow(/not found/i);
  });
});
