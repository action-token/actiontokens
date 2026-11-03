import { describe, expect, it, vi } from "vitest";

import { tellArtistAboutSale } from "../services/notifications/sale";

function setup(type: string) {
  const db = {
    item: {
      findUnique: vi.fn().mockResolvedValue({ type, artist: { userId: "artist-user" } }),
    },
    notificationEvent: { create: vi.fn().mockResolvedValue({}) },
  };
  return { ctx: { db } as never, db };
}

describe("tellArtistAboutSale", () => {
  it("tells the artist, in their portal, who bought what", async () => {
    const { ctx, db } = setup("TRACK");
    await tellArtistAboutSale(ctx, { buyerId: "fan", itemId: "i1" });
    expect(db.notificationEvent.create).toHaveBeenCalledWith({
      data: {
        type: "PURCHASE",
        actorId: "fan",
        entityId: "i1",
        notifications: {
          createMany: { data: [{ recipientId: "artist-user", isForArtist: true }] },
        },
      },
    });
  });

  it("calls buying the fan token joining the membership", async () => {
    const { ctx, db } = setup("FAN_TOKEN");
    await tellArtistAboutSale(ctx, { buyerId: "fan", itemId: "i1" });
    expect(db.notificationEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: "MEMBERSHIP" }),
    });
  });

  it("skips orders without a buyer or item, and never throws", async () => {
    const { ctx, db } = setup("TRACK");
    await tellArtistAboutSale(ctx, { buyerId: null, itemId: "i1" });
    expect(db.item.findUnique).not.toHaveBeenCalled();
    db.item.findUnique.mockRejectedValue(new Error("down"));
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(
      tellArtistAboutSale(ctx, { buyerId: "fan", itemId: "i1" }),
    ).resolves.toBeUndefined();
    quiet.mockRestore();
  });
});
