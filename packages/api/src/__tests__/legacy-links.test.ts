import { describe, expect, it, vi } from "vitest";

import { resolveLegacyLink } from "../services/platform/legacy-links";

function setup(
  over: {
    mapped?: string | null;
    artist?: unknown;
    item?: unknown;
    listing?: unknown;
    album?: unknown;
  } = {},
) {
  const db = {
    legacyIdMap: {
      findUnique: vi
        .fn()
        .mockResolvedValue(over.mapped === null ? null : { newId: over.mapped ?? "new1" }),
    },
    artist: { findUnique: vi.fn().mockResolvedValue(over.artist ?? null) },
    item: { findFirst: vi.fn().mockResolvedValue(over.item ?? null) },
    listing: { findUnique: vi.fn().mockResolvedValue(over.listing ?? null) },
    album: { findUnique: vi.fn().mockResolvedValue(over.album ?? null) },
  };
  return { db: db as never, raw: db };
}

describe("old shared links", () => {
  it("sends an old artist link to the artist's page", async () => {
    const { db, raw } = setup({ artist: { slug: "nova" } });
    expect(await resolveLegacyLink(db, "artist", "GOLDKEY")).toBe("/artist/nova");
    expect(raw.legacyIdMap.findUnique).toHaveBeenCalledWith({
      where: { legacyTable_legacyId: { legacyTable: "Creator", legacyId: "GOLDKEY" } },
      select: { newId: true },
    });
  });

  it("sends old asset and NFT links to the item page", async () => {
    const { db } = setup({ item: { slug: "luna" } });
    expect(await resolveLegacyLink(db, "asset", "12")).toBe("/item/luna");
    expect(await resolveLegacyLink(db, "nft", "cmabc")).toBe("/item/luna");
  });

  it("sends an old market link through its listing to the item", async () => {
    const { db } = setup({ listing: { item: { slug: "luna", deletedAt: null } } });
    expect(await resolveLegacyLink(db, "market-asset", "5")).toBe("/item/luna");
    const gone = setup({ listing: { item: { slug: "luna", deletedAt: new Date() } } });
    expect(await resolveLegacyLink(gone.db, "market-asset", "5")).toBeNull();
  });

  it("sends an old album link to the album", async () => {
    const { db } = setup({ album: { slug: "first-light" } });
    expect(await resolveLegacyLink(db, "album", "1")).toBe("/album/first-light");
  });

  it("gives null for things that weren't copied, are gone, or aren't a known kind", async () => {
    expect(await resolveLegacyLink(setup({ mapped: null }).db, "artist", "x")).toBeNull();
    expect(await resolveLegacyLink(setup({ artist: null }).db, "artist", "x")).toBeNull();
    const { db, raw } = setup();
    expect(await resolveLegacyLink(db, "bounty", "x")).toBeNull();
    expect(await resolveLegacyLink(db, "artist", "")).toBeNull();
    expect(await resolveLegacyLink(db, "artist", "x".repeat(200))).toBeNull();
    expect(raw.legacyIdMap.findUnique).not.toHaveBeenCalled();
  });
});
