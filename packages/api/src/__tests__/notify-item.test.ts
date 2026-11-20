import { describe, expect, it, vi } from "vitest";

import { announceItem } from "../services/notifications/item";

function setup(item: Record<string, unknown>, sent = false) {
  const db = {
    item: {
      findUnique: vi.fn().mockResolvedValue({
        type: "TRACK",
        visibility: "PUBLIC",
        deletedAt: null,
        hiddenAt: null,
        organization: { id: "a1", userId: "artist-user" },
        ...item,
      }),
    },
    notificationEvent: {
      findFirst: vi.fn().mockResolvedValue(sent ? { id: "e1" } : null),
      create: vi.fn().mockResolvedValue({}),
    },
    follow: { findMany: vi.fn().mockResolvedValue([{ userId: "f1" }]) },
  };
  return { ctx: { db } as never, db };
}

describe("announceItem", () => {
  it("tells followers about a public release", async () => {
    const { ctx, db } = setup({});
    await announceItem(ctx, "i1");
    expect(db.notificationEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: "NEW_ITEM", actorId: "artist-user", entityId: "i1" }),
    });
  });

  it("stays quiet for drafts, fan tokens and items already announced", async () => {
    for (const [item, sent] of [
      [{ visibility: "DRAFT" }, false],
      [{ type: "FAN_TOKEN" }, false],
      [{ hiddenAt: new Date() }, false],
      [{}, true],
    ] as const) {
      const { ctx, db } = setup(item, sent);
      await announceItem(ctx, "i1");
      expect(db.notificationEvent.create).not.toHaveBeenCalled();
    }
  });
});
