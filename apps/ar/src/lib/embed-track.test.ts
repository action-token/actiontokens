import { describe, expect, it, vi } from "vitest";

import { recordEmbedEvent, underLimit } from "./embed-track";

function fakeDb(exists = 1) {
  return {
    mapEmbed: { count: vi.fn().mockResolvedValue(exists) },
    mapEmbedDailyStat: { upsert: vi.fn().mockResolvedValue({}) },
  };
}

const now = new Date("2026-10-29T23:30:00Z");

describe("recordEmbedEvent", () => {
  it("bumps the right column on the embed's UTC day", async () => {
    const db = fakeDb();
    await expect(recordEmbedEvent(db as never, JSON.stringify({ id: "m1", e: "pinTap" }), "1.1.1.1", now)).resolves.toBe(true);
    expect(db.mapEmbedDailyStat.upsert).toHaveBeenCalledWith({
      where: { embedId_day: { embedId: "m1", day: new Date("2026-10-29T00:00:00Z") } },
      create: { embedId: "m1", day: new Date("2026-10-29T00:00:00Z"), pinTaps: 1 },
      update: { pinTaps: { increment: 1 } },
    });
  });

  it("ignores previews, junk, unknown events and unknown embeds", async () => {
    const db = fakeDb(0);
    for (const raw of ["", "not json", JSON.stringify({ id: "preview", e: "view" }), JSON.stringify({ id: "m1", e: "hack" }), JSON.stringify({ id: "m1", e: "view" })]) {
      await expect(recordEmbedEvent(db as never, raw, "2.2.2.2", now)).resolves.toBe(false);
    }
    expect(db.mapEmbedDailyStat.upsert).not.toHaveBeenCalled();
  });

  it("stops counting one visitor after 60 a minute", () => {
    const t = now.getTime();
    for (let i = 0; i < 60; i++) expect(underLimit("3.3.3.3:m1", t)).toBe(true);
    expect(underLimit("3.3.3.3:m1", t)).toBe(false);
    expect(underLimit("3.3.3.3:m1", t + 61_000)).toBe(true);
  });
});
