import { describe, expect, it, vi } from "vitest";

import type { Db } from "@actiontokens/db";

import {
  createAnnouncement,
  listAnnouncements,
  removeAnnouncement,
  updateAnnouncement,
} from "../services/artist/announcements";
import { createEvent, listEvents, removeEvent, updateEvent } from "../services/artist/events";

vi.mock("@actiontokens/storage", () => ({
  isOwnS3Url: (url: string) => url.startsWith("https://cdn.example/"),
}));

type Row = Record<string, unknown>;

const artist = { id: "a1" };
const now = new Date("2026-11-01T12:00:00Z");
const starts = new Date("2026-12-01T20:00:00Z");
const ends = new Date("2026-12-01T23:00:00Z");

function setup(opts: { event?: Row | null; announcement?: Row | null } = {}) {
  const written: Row[] = [];
  const db = {
    event: {
      findMany: vi
        .fn()
        .mockResolvedValue([
          { id: "e1", title: "Gig", _count: { rsvps: 4, pins: 1, bounties: 0 } },
        ]),
      findFirst: vi
        .fn()
        .mockResolvedValue(
          opts.event === undefined
            ? { id: "e1", startsAt: starts, endsAt: ends, capacity: null, _count: { rsvps: 4 } }
            : opts.event,
        ),
      create: vi.fn(({ data }: { data: Row }) => {
        written.push(data);
        return Promise.resolve({ id: "e1" });
      }),
      update: vi.fn(({ data }: { data: Row }) => {
        written.push(data);
        return Promise.resolve({});
      }),
      delete: vi.fn().mockResolvedValue({}),
    },
    announcement: {
      findMany: vi.fn().mockResolvedValue([{ id: "n1", title: "News", _count: { comments: 2 } }]),
      findFirst: vi
        .fn()
        .mockResolvedValue(
          opts.announcement === undefined
            ? { id: "n1", ctaLabel: null, ctaUrl: null }
            : opts.announcement,
        ),
      create: vi.fn(({ data }: { data: Row }) => {
        written.push(data);
        return Promise.resolve({ id: "n1" });
      }),
      update: vi.fn(({ data }: { data: Row }) => {
        written.push(data);
        return Promise.resolve({});
      }),
      delete: vi.fn().mockResolvedValue({}),
    },
  };
  const activity = { set: vi.fn(), facts: () => ({}) };
  return { ctx: { db: db as unknown as Db, activity }, db, written, activity };
}

const event = {
  title: " Album launch ",
  description: "Come along",
  startsAt: starts,
  endsAt: ends,
};

describe("events", () => {
  it("creates an event, trims text and logs it", async () => {
    const { ctx, written, activity } = setup();
    await expect(
      createEvent(ctx, artist, {
        ...event,
        venueName: " The Hall ",
        link: "https://tickets.example/x",
        linkLabel: "Tickets",
        capacity: 200,
      }),
    ).resolves.toEqual({ eventId: "e1" });
    expect(written[0]).toMatchObject({
      organizationId: "a1",
      title: "Album launch",
      venueName: "The Hall",
      link: "https://tickets.example/x",
      capacity: 200,
    });
    expect(activity.set).toHaveBeenCalledWith({ targetType: "Event", targetId: "e1" });
  });

  it("refuses an event that ends before it starts", async () => {
    const { ctx, db } = setup();
    await expect(createEvent(ctx, artist, { ...event, endsAt: starts })).rejects.toThrow(
      /end after it starts/,
    );
    expect(db.event.create).not.toHaveBeenCalled();
  });

  it("refuses links that are not web addresses", async () => {
    const { ctx } = setup();
    await expect(
      createEvent(ctx, artist, { ...event, link: "javascript:alert(1)" }),
    ).rejects.toThrow(/web address/);
  });

  it("needs latitude and longitude together", async () => {
    const { ctx } = setup();
    await expect(createEvent(ctx, artist, { ...event, latitude: 40.7 })).rejects.toThrow(
      /both latitude and longitude/,
    );
  });

  it("refuses a cover that was not uploaded here", async () => {
    const { ctx } = setup();
    await expect(
      createEvent(ctx, artist, { ...event, coverUrl: "https://evil.example/x.png" }),
    ).rejects.toThrow(/Upload the cover/);
  });

  it("will not set a capacity below the RSVPs already made", async () => {
    const { ctx, db } = setup();
    await expect(updateEvent(ctx, artist, { eventId: "e1", capacity: 3 })).rejects.toThrow(
      /4 fans have already/,
    );
    expect(db.event.update).not.toHaveBeenCalled();
  });

  it("checks a moved start against the existing end", async () => {
    const { ctx } = setup();
    await expect(
      updateEvent(ctx, artist, { eventId: "e1", startsAt: new Date("2026-12-02T00:00:00Z") }),
    ).rejects.toThrow(/end after it starts/);
  });

  it("clears the cover and link when they are set to empty", async () => {
    const { ctx, written } = setup();
    await updateEvent(ctx, artist, { eventId: "e1", coverUrl: null, link: "", linkLabel: "" });
    expect(written[0]).toEqual({ coverUrl: null, link: null, linkLabel: null });
  });

  it("only touches the artist's own events", async () => {
    const { ctx, db } = setup({ event: null });
    await expect(removeEvent(ctx, artist, "someone-elses")).rejects.toThrow(/Event not found/);
    expect(db.event.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "someone-elses", organizationId: "a1" } }),
    );
    expect(db.event.delete).not.toHaveBeenCalled();
  });

  it("lists events with their counts", async () => {
    const { ctx } = setup();
    await expect(listEvents(ctx, artist)).resolves.toEqual([
      { id: "e1", title: "Gig", rsvps: 4, pins: 1, bounties: 0 },
    ]);
  });

  it("deletes an event", async () => {
    const { ctx, db } = setup();
    await removeEvent(ctx, artist, "e1");
    expect(db.event.delete).toHaveBeenCalledWith({ where: { id: "e1" } });
  });
});

describe("announcements", () => {
  const news = { title: "New single", body: "Out Friday" };

  it("creates an announcement with a button", async () => {
    const { ctx, written } = setup();
    await createAnnouncement(
      ctx,
      artist,
      {
        ...news,
        isPinned: true,
        ctaLabel: "Listen",
        ctaUrl: "https://action-tokens.com/x",
        expiresAt: new Date("2026-12-01T00:00:00Z"),
      },
      now,
    );
    expect(written[0]).toMatchObject({
      organizationId: "a1",
      isPinned: true,
      ctaLabel: "Listen",
      ctaUrl: "https://action-tokens.com/x",
      imageUrls: [],
    });
  });

  it("needs a label and a link together", async () => {
    const { ctx } = setup();
    await expect(
      createAnnouncement(ctx, artist, { ...news, ctaLabel: "Listen" }, now),
    ).rejects.toThrow(/both a label and a link/);
  });

  it("refuses an end date in the past", async () => {
    const { ctx } = setup();
    await expect(
      createAnnouncement(
        ctx,
        artist,
        { ...news, expiresAt: new Date("2026-10-01T00:00:00Z") },
        now,
      ),
    ).rejects.toThrow(/in the future/);
  });

  it("allows at most four images, all uploaded here", async () => {
    const { ctx } = setup();
    const img = "https://cdn.example/a.png";
    await expect(
      createAnnouncement(ctx, artist, { ...news, imageUrls: [img, img, img, img, img] }, now),
    ).rejects.toThrow(/at most 4/);
    await expect(
      createAnnouncement(ctx, artist, { ...news, imageUrls: ["https://evil.example/a.png"] }, now),
    ).rejects.toThrow(/Upload the images/);
  });

  it("checks a new label against the saved link", async () => {
    const { ctx, db } = setup({
      announcement: { id: "n1", ctaLabel: null, ctaUrl: "https://action-tokens.com/x" },
    });
    await expect(
      updateAnnouncement(ctx, artist, { announcementId: "n1", ctaUrl: null }, now),
    ).resolves.toEqual({ announcementId: "n1" });
    expect(db.announcement.update).toHaveBeenCalledWith({
      where: { id: "n1" },
      data: { ctaLabel: null, ctaUrl: null },
    });
  });

  it("lists with the comment count and removes only its own", async () => {
    const { ctx, db } = setup();
    await expect(listAnnouncements(ctx, artist)).resolves.toEqual([
      { id: "n1", title: "News", comments: 2 },
    ]);
    await removeAnnouncement(ctx, artist, "n1");
    expect(db.announcement.delete).toHaveBeenCalledWith({ where: { id: "n1" } });
    const other = setup({ announcement: null });
    await expect(removeAnnouncement(other.ctx, artist, "x")).rejects.toThrow(/not found/);
  });
});
