import { describe, expect, it, vi } from "vitest";

import { searchAll } from "../services/catalog/search";

function setup(over: { items?: object[]; artists?: object[]; bounties?: object[] } = {}) {
  const db = {
    item: { findMany: vi.fn().mockResolvedValue(over.items ?? []) },
    organization: { findMany: vi.fn().mockResolvedValue(over.artists ?? []) },
    bounty: { findMany: vi.fn().mockResolvedValue(over.bounties ?? []) },
  };
  return { ctx: { db } as never, db };
}

describe("search", () => {
  it("does nothing for a search shorter than two letters", async () => {
    const { ctx, db } = setup();
    expect(await searchAll(ctx, " a ")).toEqual({ items: [], artists: [], bounties: [] });
    expect(db.item.findMany).not.toHaveBeenCalled();
  });

  it("looks in items, artists and bounties, only public ones", async () => {
    const { ctx, db } = setup();
    await searchAll(ctx, "green");
    expect(db.item.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: null,
          hiddenAt: null,
          OR: [
            { title: { contains: "green", mode: "insensitive" } },
            { organization: { name: { contains: "green", mode: "insensitive" } } },
          ],
        }),
        take: 5,
      }),
    );
    expect(db.organization.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: "APPROVED", name: { contains: "green", mode: "insensitive" } },
        take: 5,
      }),
    );
    expect(db.bounty.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          hiddenAt: null,
          status: { not: "COMPLETED" },
          title: { contains: "green", mode: "insensitive" },
        }),
        take: 4,
      }),
    );
  });

  it("returns the rows in a small shape", async () => {
    const { ctx } = setup({
      artists: [
        { name: "DJ Tamsin", slug: "dj-tamsin", avatarUrl: null, _count: { followers: 7 } },
      ],
      bounties: [{ id: "b1", title: "Remix contest" }],
    });
    const found = await searchAll(ctx, "dj");
    expect(found.artists).toEqual([
      { name: "DJ Tamsin", slug: "dj-tamsin", avatarUrl: null, followers: 7 },
    ]);
    expect(found.bounties).toEqual([{ id: "b1", title: "Remix contest" }]);
  });
});
