import { describe, expect, it, vi } from "vitest";

import { describeForArtist } from "../services/notifications/describe";
import {
  expireVanityLinks,
  parseVanityKey,
  reminderStage,
  vanityKey,
} from "../services/artist/vanity-expire";

const DAY = 86_400_000;
const now = new Date("2026-11-03T10:00:00Z");
const at = (days: number) => new Date(now.getTime() + days * DAY);

function link(paidUntilDays: number, over: Record<string, unknown> = {}) {
  return {
    artistId: "a1",
    name: "tamsin",
    status: "ACTIVE" as const,
    paidUntil: at(paidUntilDays),
    graceEndsAt: null,
    reservedUntil: null,
    artist: { userId: "artist-user" },
    ...over,
  };
}

function setup(links: unknown[], sent = false) {
  const db = {
    vanityUrl: {
      findMany: vi.fn().mockResolvedValue(links),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    notificationEvent: {
      findFirst: vi.fn().mockResolvedValue(sent ? { id: "e1" } : null),
      create: vi.fn().mockResolvedValue({}),
    },
  };
  return { ctx: { db } as never, db };
}

describe("short-link reminders", () => {
  it("knows which reminder is due: soon, grace, stopped, or none", () => {
    expect(reminderStage(link(10), now)).toBeNull();
    expect(reminderStage(link(2), now)).toBe("SOON");
    expect(reminderStage(link(-2), now)).toBe("GRACE");
    expect(reminderStage(link(-10), now)).toBe("LAPSED");
    expect(reminderStage(link(-40), now)).toBeNull();
  });

  it("round-trips what a reminder is about", () => {
    const key = vanityKey("GRACE", at(-2), "tamsin");
    expect(parseVanityKey(key)).toEqual({ stage: "GRACE", paidUntil: at(-2), name: "tamsin" });
    expect(parseVanityKey("p1")).toBeNull();
  });

  it("reminds the artist in their portal bell, once per stage and month", async () => {
    const { ctx, db } = setup([link(-2)]);
    expect(await expireVanityLinks(ctx, now)).toMatchObject({ reminded: 1, updated: 1 });
    expect(db.notificationEvent.create).toHaveBeenCalledWith({
      data: {
        type: "VANITY",
        actorId: "artist-user",
        entityId: vanityKey("GRACE", at(-2), "tamsin"),
        notifications: { create: { recipientId: "artist-user", isForArtist: true } },
      },
    });
    expect(db.vanityUrl.updateMany).toHaveBeenCalledWith({
      where: { artistId: "a1", paidUntil: at(-2) },
      data: { status: "GRACE", graceEndsAt: at(5), reservedUntil: at(35) },
    });

    const again = setup(
      [link(-2, { status: "GRACE", graceEndsAt: at(5), reservedUntil: at(35) })],
      true,
    );
    expect(await expireVanityLinks(again.ctx, now)).toMatchObject({ reminded: 0, updated: 0 });
    expect(again.db.notificationEvent.create).not.toHaveBeenCalled();
  });

  it("frees a name once its reserved days are over", async () => {
    const { ctx, db } = setup([link(-40)]);
    expect(await expireVanityLinks(ctx, now)).toMatchObject({ released: 1, reminded: 0 });
    expect(db.vanityUrl.deleteMany).toHaveBeenCalledWith({
      where: { artistId: "a1", paidUntil: at(-40) },
    });
  });

  it("reads plainly in the bell and opens the short-link settings", () => {
    const actor = { name: "DJ Tamsin", username: null, artistSlug: "dj-tamsin" };
    const soon = describeForArtist("VANITY", {
      actor,
      vanity: { stage: "SOON", paidUntil: at(2), name: "tamsin" },
    });
    expect(soon).toEqual({
      text: "bandcoin.io/tamsin runs out on Nov 5. Renew to keep it working.",
      href: "/settings?tab=short-link",
    });
    expect(
      describeForArtist("VANITY", {
        actor,
        vanity: { stage: "LAPSED", paidUntil: at(-10), name: "tamsin" },
      }).text,
    ).toMatch(/stopped working .* 30 more days/);
  });
});
