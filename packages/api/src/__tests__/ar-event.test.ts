import { describe, expect, it, vi } from "vitest";

import type { Db } from "@bandcoin/db";

import { createContext, type SessionUser } from "../context";
import { arRouter } from "../root-ar";
import { webUrl } from "../routers/ar/event";
import type { ChainGateway } from "../services/chain-gateway";
import { createCallerFactory } from "../trpc";

const me: SessionUser = { id: "me", role: "FAN", walletAddress: "GME", walletType: "freighter" };
const future = new Date(Date.now() + 86_400_000);

function caller(db: object, user: SessionUser | null = me) {
  const full = { ...db, activityLog: { create: vi.fn().mockResolvedValue({}) } } as unknown as Db;
  return createCallerFactory(arRouter)(
    createContext({
      db: full,
      chain: {} as ChainGateway,
      app: "ar",
      session: user ? { user } : null,
    }),
  );
}

const eventRow = {
  id: "e1",
  title: "Launch night",
  description: "Come along",
  coverUrl: null,
  startsAt: new Date("2026-11-01T18:00:00Z"),
  endsAt: future,
  venueName: "The Hall",
  address: null,
  latitude: 40.7,
  longitude: -74,
  link: "javascript:alert(1)",
  linkLabel: null,
  capacity: null,
  artist: { id: "a1", name: "Luna Vale", avatarUrl: null },
  _count: { rsvps: 2, comments: 1 },
  rsvps: [],
  pins: [],
  bounties: [{ id: "b1", title: "Film the set" }],
};

/** A database whose transaction runs on the same mocks. */
function rsvpDb(over: { capacity?: number | null; endsAt?: Date; taken?: number } = {}) {
  const eventRsvp = {
    findUnique: vi.fn().mockResolvedValue(null),
    count: vi.fn().mockResolvedValue(over.taken ?? 0),
    create: vi.fn().mockResolvedValue({}),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
  return {
    event: {
      findUnique: vi.fn().mockResolvedValue({
        id: "e1",
        endsAt: over.endsAt ?? future,
        capacity: over.capacity ?? null,
      }),
    },
    eventRsvp,
    $transaction: (run: (tx: { eventRsvp: typeof eventRsvp }) => unknown) => run({ eventRsvp }),
  };
}

describe("ar event", () => {
  it("shows an event with its funded bounties, and drops links that aren't web links", async () => {
    const db = { event: { findUnique: vi.fn().mockResolvedValue(eventRow) } };
    const event = await caller(db).event.byId({ id: "e1" });
    expect(event).toMatchObject({
      goingCount: 2,
      commentCount: 1,
      link: null,
      hasLink: false,
      isPast: false,
      isFull: false,
    });
    expect(event.bounties).toEqual([
      { id: "b1", title: "Film the set", imageUrl: "/brand/bandcoin-mark.png" },
    ]);
    expect(db.event.findUnique.mock.calls[0]?.[0]).toMatchObject({
      include: { bounties: { where: { fundTxHash: { not: null } } } },
    });
  });

  it("keeps plain web links", () => {
    expect(webUrl(" https://tickets.example/x ")).toBe("https://tickets.example/x");
    expect(webUrl("data:text/html,hi")).toBeNull();
    expect(webUrl(null)).toBeNull();
  });

  it("needs sign-in for the Following filter", async () => {
    await expect(caller({}, null).event.list({ following: true })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("RSVPs once, and refuses a full or finished event", async () => {
    const db = rsvpDb({ capacity: 10, taken: 3 });
    await expect(caller(db).event.rsvp({ id: "e1", going: true })).resolves.toEqual({
      going: true,
      goingCount: 3,
    });
    expect(db.eventRsvp.create).toHaveBeenCalledWith({ data: { eventId: "e1", userId: "me" } });

    await expect(
      caller(rsvpDb({ capacity: 3, taken: 3 })).event.rsvp({ id: "e1", going: true }),
    ).rejects.toMatchObject({
      message: "This event is full.",
    });
    await expect(
      caller(rsvpDb({ endsAt: new Date("2020-01-01") })).event.rsvp({ id: "e1", going: true }),
    ).rejects.toMatchObject({
      message: "This event has already ended.",
    });
  });

  it("lets only the author or the artist delete a comment", async () => {
    const comment = { authorId: "someone", event: { artist: { userId: "artist-user" } } };
    const db = {
      eventComment: {
        findUnique: vi.fn().mockResolvedValue(comment),
        delete: vi.fn().mockResolvedValue({}),
      },
    };
    await expect(
      caller(db).event.deleteComment({ kind: "event", commentId: "c1" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.eventComment.delete).not.toHaveBeenCalled();

    await caller(db, { ...me, id: "artist-user" }).event.deleteComment({
      kind: "event",
      commentId: "c1",
    });
    expect(db.eventComment.delete).toHaveBeenCalledWith({ where: { id: "c1" } });
  });

  it("treats an expired announcement as gone", async () => {
    const db = { announcement: { findFirst: vi.fn().mockResolvedValue(null) } };
    await expect(caller(db).event.announcement({ id: "n1" })).rejects.toMatchObject({
      message: "Announcement not found.",
    });
    expect(db.announcement.findFirst.mock.calls[0]?.[0]).toMatchObject({
      where: {
        id: "n1",
        OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) as Date } }],
      },
    });
  });
});
