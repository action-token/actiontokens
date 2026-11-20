import { describe, expect, it, vi } from "vitest";

import { loadInbox, markInboxSeen } from "../services/notifications/inbox";

const row = (type: string, entityId: string) => ({
  id: `n-${entityId}`,
  seenAt: null,
  createdAt: new Date("2026-11-03T10:00:00Z"),
  event: {
    type,
    entityId,
    actor: { displayName: "Ana", username: "ana", avatarUrl: null, artist: null },
  },
});

function setup(rows: unknown[]) {
  const db = {
    notification: {
      findMany: vi.fn().mockResolvedValue(rows),
      count: vi.fn().mockResolvedValue(rows.length),
      updateMany: vi.fn().mockResolvedValue({ count: 2 }),
    },
    bounty: { findMany: vi.fn().mockResolvedValue([]) },
    item: { findMany: vi.fn().mockResolvedValue([]) },
    post: { findMany: vi.fn().mockResolvedValue([{ id: "p1", title: "Tour diary" }]) },
    community: { findMany: vi.fn().mockResolvedValue([]) },
  };
  return { ctx: { db } as never, db };
}

describe("inbox", () => {
  it("reads the artist's notifications only, worded for the portal", async () => {
    const { ctx, db } = setup([row("LIKE", "p1")]);
    const inbox = await loadInbox(ctx, "u1", "ARTIST", null);
    expect(db.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { recipientId: "u1", isForArtist: true } }),
    );
    expect(inbox.items[0]).toMatchObject({
      text: "Ana liked your post “Tour diary”.",
      href: "/posts/p1",
      seen: false,
    });
    expect(inbox).toMatchObject({ unread: 1, next: null });
  });

  it("keeps fan and artist notifications apart when marking them seen", async () => {
    const { ctx, db } = setup([]);
    await markInboxSeen(ctx, "u1", "FAN");
    expect(db.notification.updateMany).toHaveBeenCalledWith({
      where: { recipientId: "u1", isForArtist: false, seenAt: null },
      data: { seenAt: expect.any(Date) },
    });
  });
});
