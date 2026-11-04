import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError, ErrorCodes } from "@bandcoin/errors";

import type { SessionUser } from "../context";
import { endOfDay, executeAction } from "../services/agent/actions";
import { batchStatus, runPinBatch, startPinBatch } from "../services/agent/batch";
import {
  cancelAction,
  confirmAction,
  pinJobStatus,
  pollRun,
  sendMessage,
} from "../services/agent/conversations";
import type { PlaceItem, ProposedAction } from "../services/agent/contract";

const svc = vi.hoisted(() => ({
  createPin: vi.fn(),
  setPinHidden: vi.fn(),
  updatePin: vi.fn(),
  createHotspot: vi.fn(),
  removeHotspot: vi.fn(),
  setHotspotPaused: vi.fn(),
  updateHotspot: vi.fn(),
  createEvent: vi.fn(),
  removeEvent: vi.fn(),
  updateEvent: vi.fn(),
  createAnnouncement: vi.fn(),
  removeAnnouncement: vi.fn(),
  updateAnnouncement: vi.fn(),
}));
vi.mock("../services/artist/pins", () => ({
  createPin: svc.createPin,
  setPinHidden: svc.setPinHidden,
  updatePin: svc.updatePin,
  MAX_RADIUS_METERS: 5000,
}));
vi.mock("../services/artist/hotspots", () => ({
  createHotspot: svc.createHotspot,
  removeHotspot: svc.removeHotspot,
  setHotspotPaused: svc.setHotspotPaused,
  updateHotspot: svc.updateHotspot,
}));
vi.mock("../services/artist/events", () => ({
  createEvent: svc.createEvent,
  removeEvent: svc.removeEvent,
  updateEvent: svc.updateEvent,
}));
vi.mock("../services/artist/announcements", () => ({
  createAnnouncement: svc.createAnnouncement,
  removeAnnouncement: svc.removeAnnouncement,
  updateAnnouncement: svc.updateAnnouncement,
}));

const artist = { id: "a1", name: "Nova" };
const user: SessionUser = { id: "u1", role: "ARTIST", walletAddress: "G1", walletType: "email" };

const place = (n: number, over: Partial<PlaceItem> = {}): PlaceItem => ({
  key: `p${n}`,
  title: `Park ${n}`,
  address: `${n} Main St`,
  lat: 40 + n / 100,
  lng: -74,
  kind: "place",
  ...over,
});

const defaults = {
  type: "LANDMARK" as const,
  startDate: "2026-12-01",
  endDate: "2026-12-31",
  autoCollect: false,
  pinNumber: 2,
  radius: 20,
  collectionLimit: 50,
  grouping: "per-location" as const,
};

function setup() {
  const jobs: Record<string, unknown>[] = [];
  const db = {
    pinBatchJob: {
      create: vi.fn().mockResolvedValue({ id: "b1" }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    job: {
      findFirst: vi.fn(),
      create: vi.fn((args: { data: Record<string, unknown> }) => {
        jobs.push(args.data);
        return Promise.resolve({ id: "j1" });
      }),
    },
    agentJob: {
      create: vi.fn().mockResolvedValue({ id: "aj1" }),
      update: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn(),
    },
    agentConversation: {
      create: vi.fn().mockResolvedValue({ id: "c1", title: "hi" }),
      findFirst: vi.fn().mockResolvedValue({ id: "c1", title: "hi" }),
      update: vi.fn().mockResolvedValue({}),
    },
    agentMessage: {
      create: vi.fn().mockResolvedValue({
        id: "m1",
        role: "user",
        text: "hi",
        blocks: [],
        steps: [],
        createdAt: new Date(),
      }),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    agentAction: { findFirst: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    aiUsage: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn().mockResolvedValue({}) },
  };
  const ctx = { db, activity: { set: vi.fn() } } as never;
  return { ctx, db, jobs };
}

beforeEach(() => Object.values(svc).forEach((fn) => fn.mockReset()));

describe("dates the agent writes", () => {
  it("treats a plain date as the whole day", () => {
    expect(endOfDay("2026-12-31").toISOString()).toBe("2026-12-31T23:59:59.999Z");
    expect(endOfDay("2026-12-31T10:00:00Z").toISOString()).toBe("2026-12-31T10:00:00.000Z");
  });
});

describe("carrying out a confirmed proposal", () => {
  it("queues a batch with the card's places and edits", async () => {
    const { ctx, db, jobs } = setup();
    const action: ProposedAction = {
      type: "create_pins",
      items: [place(1), place(2), place(3)],
      defaults,
    };
    const done = await executeAction(ctx, artist, action, {
      keep: ["p1", "p3"],
      defaults: { pinNumber: 5, endDate: "2026-12-24" },
    });
    expect(done).toEqual({ message: "Creating 2 pins…", pinJobId: "b1" });
    const data = db.pinBatchJob.create.mock.calls[0]![0].data;
    expect(data.total).toBe(2);
    expect(data.payload.places.map((p: { id: string }) => p.id)).toEqual(["p1", "p3"]);
    expect(data.payload.places[0].endsAt).toBe("2026-12-24T23:59:59.999Z");
    expect(data.payload.options).toMatchObject({ pinNumber: 5, grouping: "per-location" });
    expect(jobs).toEqual([expect.objectContaining({ type: "pins.batch", maxAttempts: 1 })]);
  });

  it("keeps an event's own dates", async () => {
    const { ctx, db } = setup();
    const event = place(1, { kind: "event", startDate: "2026-12-05", endDate: "2026-12-06" });
    await executeAction(ctx, artist, { type: "create_pins", items: [event], defaults });
    const first = db.pinBatchJob.create.mock.calls[0]![0].data.payload.places[0];
    expect(first.startsAt).toBe("2026-12-05T00:00:00.000Z");
    expect(first.endsAt).toBe("2026-12-06T23:59:59.999Z");
  });

  it("refuses nothing picked, odd edits and pins that end before they start", async () => {
    const { ctx } = setup();
    const action: ProposedAction = { type: "create_pins", items: [place(1)], defaults };
    await expect(executeAction(ctx, artist, action, { keep: [] })).rejects.toThrow(/at least one/);
    await expect(
      executeAction(ctx, artist, action, { defaults: { pinNumber: 5000 } }),
    ).rejects.toThrow(/pinNumber/);
    await expect(
      executeAction(ctx, artist, action, { defaults: { endDate: "2026-11-01" } }),
    ).rejects.toThrow(/end after/);
  });

  it("hides, pauses and removes through the normal services", async () => {
    const { ctx } = setup();
    await executeAction(ctx, artist, {
      type: "hide_pins",
      pins: [
        { id: "x1", title: "A" },
        { id: "x2", title: "B" },
      ],
    });
    expect(svc.setPinHidden).toHaveBeenCalledWith(ctx, artist, "x2", true);
    await executeAction(ctx, artist, {
      type: "hotspot_state",
      hotspot: { id: "h1", title: "H" },
      op: "pause",
    });
    expect(svc.setHotspotPaused).toHaveBeenCalledWith(ctx, artist, {
      hotspotId: "h1",
      paused: true,
    });
    await executeAction(ctx, artist, {
      type: "hotspot_state",
      hotspot: { id: "h1", title: "H" },
      op: "delete",
    });
    expect(svc.removeHotspot).toHaveBeenCalledWith(ctx, artist, "h1");
  });

  it("turns unlimited into no limit when it edits pins", async () => {
    const { ctx } = setup();
    await executeAction(ctx, artist, {
      type: "update_pins",
      pins: [{ id: "x1", title: "A" }],
      changes: { collectionLimit: 999_999, endDate: "2027-01-01", title: "New" },
    });
    expect(svc.updatePin).toHaveBeenCalledWith(ctx, artist, {
      pinId: "x1",
      title: "New",
      endsAt: new Date("2027-01-01T23:59:59.999Z"),
      claimLimit: 0,
    });
  });

  it("creates a circular hotspot that goes live as a normal public hotspot", async () => {
    const { ctx } = setup();
    svc.createHotspot.mockResolvedValue({ hotspotId: "h9" });
    const result = await executeAction(ctx, artist, {
      type: "create_hotspot",
      hotspot: {
        title: "Downtown",
        lat: 40.7,
        lng: -74,
        radiusMetres: 800,
        type: "EXPERIENCE",
        startDate: "2026-12-01",
        endDate: "2026-12-31",
        dropEveryDays: 7,
        pinDurationDays: 3,
        pinNumber: 4,
        collectionLimit: 999_999,
        autoCollect: true,
      },
    });
    expect(result).toEqual({ message: "Hotspot “Downtown” created.", id: "h9" });
    const input = svc.createHotspot.mock.calls[0]![2];
    expect(input).toMatchObject({
      visibility: "PUBLIC",
      reward: { kind: "NONE" },
      claimLimit: 0,
      spotsPerDrop: 4,
      area: { shape: "circle" },
    });
  });

  it("validates a hotspot card edit before creating anything", async () => {
    const { ctx } = setup();
    await expect(
      executeAction(
        ctx,
        artist,
        {
          type: "create_hotspot",
          hotspot: {
            title: "Downtown",
            lat: 40,
            lng: -74,
            radiusMetres: 800,
            type: "EXPERIENCE",
            startDate: "2026-12-01",
            endDate: "2026-12-31",
            dropEveryDays: 7,
            pinDurationDays: 3,
            pinNumber: 4,
            collectionLimit: 10,
            autoCollect: false,
          },
        },
        { draft: { radiusMetres: 99_999_999 } },
      ),
    ).rejects.toThrow(/radiusMetres/);
    expect(svc.createHotspot).not.toHaveBeenCalled();
  });

  it("creates events and announcements with the dates the card shows", async () => {
    const { ctx } = setup();
    svc.createEvent.mockResolvedValue({ eventId: "e1" });
    svc.createAnnouncement.mockResolvedValue({ announcementId: "n1" });
    await executeAction(ctx, artist, {
      type: "create_event",
      event: {
        title: "Launch",
        description: "Party",
        startDate: "2026-12-05",
        endDate: "2026-12-05",
        lat: 1,
        lng: 2,
      },
    });
    expect(svc.createEvent.mock.calls[0]![2]).toMatchObject({
      endsAt: new Date("2026-12-05T23:59:59.999Z"),
      latitude: 1,
      longitude: 2,
    });
    await executeAction(ctx, artist, {
      type: "create_announcement",
      announcement: {
        title: "News",
        body: "Hello",
        pinned: true,
        expiresAt: "2026-12-10T00:00:00Z",
      },
    });
    expect(svc.createAnnouncement.mock.calls[0]![2]).toMatchObject({
      isPinned: true,
      expiresAt: new Date("2026-12-10T00:00:00Z"),
    });
  });
});

describe("batch pins", () => {
  const payload = (grouping: "per-location" | "single-group", count = 3) => ({
    places: Array.from({ length: count }, (_, i) => ({
      id: `p${i}`,
      title: `Park ${i}`,
      description: "d",
      latitude: 40 + i / 100,
      longitude: -74,
      startsAt: "2026-12-01T00:00:00.000Z",
      endsAt: "2026-12-31T23:59:59.999Z",
    })),
    options: {
      type: "LANDMARK" as const,
      autoCollect: false,
      pinNumber: 2,
      radius: 20,
      collectionLimit: 50,
      grouping,
    },
  });

  it("makes each pin live without review, with the batch's shared tags", async () => {
    const { ctx, db } = setup();
    db.pinBatchJob.findUniqueOrThrow.mockResolvedValue({
      artistId: "a1",
      payload: payload("per-location"),
    });
    svc.createPin.mockResolvedValue({ pinId: "x" });
    const out = await runPinBatch(ctx, "b1", {
      tags: () => Promise.resolve(["parks", "outdoors"]),
    });
    expect(out).toMatchObject({ outcome: "DONE", created: 3, failed: 0 });
    expect(svc.createPin).toHaveBeenCalledTimes(3);
    const [, , input, , drop, options] = svc.createPin.mock.calls[0]!;
    expect(options).toEqual({ live: true });
    expect(drop).toBeUndefined();
    expect(input).toMatchObject({
      claimLimit: 50,
      spotCount: 2,
      tags: ["parks", "outdoors"],
      reward: { kind: "NONE" },
    });
    expect(db.pinBatchJob.update).toHaveBeenLastCalledWith({
      where: { id: "b1" },
      data: expect.objectContaining({ status: "SUCCEEDED", completed: 3 }),
    });
  });

  it("keeps going when one place fails, and says which", async () => {
    const { ctx, db } = setup();
    db.pinBatchJob.findUniqueOrThrow.mockResolvedValue({
      artistId: "a1",
      payload: payload("per-location"),
    });
    svc.createPin
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("That title isn't allowed"))
      .mockResolvedValueOnce({});
    const out = await runPinBatch(ctx, "b1");
    expect(out).toMatchObject({ created: 2, failed: 1 });
    const last = db.pinBatchJob.update.mock.calls.at(-1)![0].data;
    expect(last.status).toBe("FAILED");
    expect(last.log[1]).toEqual({
      title: "Park 1",
      status: "error",
      error: "That title isn't allowed",
    });
  });

  it("makes one pin with every place's spots for a single group", async () => {
    const { ctx, db } = setup();
    db.pinBatchJob.findUniqueOrThrow.mockResolvedValue({
      artistId: "a1",
      payload: payload("single-group"),
    });
    svc.createPin.mockResolvedValue({});
    await runPinBatch(ctx, "b1");
    expect(svc.createPin).toHaveBeenCalledTimes(1);
    const drop = svc.createPin.mock.calls[0]![4];
    expect(drop.spots).toHaveLength(6);
  });

  it("maps unlimited to no limit, and uses a place's photo when it has one", async () => {
    const { ctx, db } = setup();
    const p = payload("per-location", 1);
    p.options.collectionLimit = 999_999;
    db.pinBatchJob.findUniqueOrThrow.mockResolvedValue({ artistId: "a1", payload: p });
    svc.createPin.mockResolvedValue({});
    await runPinBatch(ctx, "b1", {
      enrich: (place) =>
        Promise.resolve({ ...place, image: "https://img/x.jpg", url: "https://maps/x" }),
    });
    expect(svc.createPin.mock.calls[0]![2]).toMatchObject({
      claimLimit: 0,
      imageUrl: "https://img/x.jpg",
      link: "https://maps/x",
    });
  });

  it("runs a batch once", async () => {
    const { ctx, db } = setup();
    db.pinBatchJob.updateMany.mockResolvedValue({ count: 0 });
    expect(await runPinBatch(ctx, "b1")).toEqual({ batchId: "b1", outcome: "SKIPPED" });
    expect(svc.createPin).not.toHaveBeenCalled();
  });

  it("reports progress, and calls a silent batch lost", async () => {
    const { ctx, db } = setup();
    const row = (status: string, ago: number) => ({
      status,
      total: 3,
      completed: 1,
      log: [{ title: "Park 1", status: "error" }],
      error: null,
      updatedAt: new Date(Date.now() - ago),
    });
    db.pinBatchJob.findFirst.mockResolvedValueOnce(row("RUNNING", 1000));
    expect(await batchStatus(ctx, artist, "b1")).toMatchObject({
      status: "RUNNING",
      failed: ["Park 1"],
    });
    db.pinBatchJob.findFirst.mockResolvedValueOnce(row("RUNNING", 11 * 60_000));
    expect(await batchStatus(ctx, artist, "b1")).toMatchObject({ status: "FAILED" });
    db.pinBatchJob.findFirst.mockResolvedValueOnce(null);
    await expect(pinJobStatus(ctx, artist, "nope")).rejects.toThrow(/not found/);
  });

  it("starts a batch with one attempt", async () => {
    const { ctx, jobs } = setup();
    await startPinBatch(ctx, artist, payload("per-location"));
    expect(jobs[0]).toMatchObject({ type: "pins.batch", maxAttempts: 1 });
  });
});

describe("the chat", () => {
  it("starts a conversation, queues one run, and counts the message", async () => {
    const { ctx, db, jobs } = setup();
    const sent = await sendMessage(ctx, artist, user, { text: "  Find parks in Austin  " });
    expect(sent).toMatchObject({ conversationId: "c1", jobId: "aj1" });
    expect(db.agentMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { conversationId: "c1", role: "user", text: "Find parks in Austin" },
      }),
    );
    expect(jobs[0]).toMatchObject({ type: "agent.run", maxAttempts: 1 });
    expect(db.aiUsage.upsert).toHaveBeenCalled();
  });

  it("stops at the daily limit without starting anything", async () => {
    const { ctx, db } = setup();
    db.aiUsage.findUnique.mockResolvedValue({ text: 50, image: 0 });
    await expect(sendMessage(ctx, artist, user, { text: "hello there" })).rejects.toThrow(
      /today's 50/,
    );
    expect(db.agentConversation.create).not.toHaveBeenCalled();
  });

  it("doesn't limit an admin", async () => {
    const { ctx, db } = setup();
    db.aiUsage.findUnique.mockResolvedValue({ text: 500, image: 0 });
    await sendMessage(ctx, artist, { ...user, role: "ADMIN" }, { text: "hello there" });
    expect(db.aiUsage.upsert).not.toHaveBeenCalled();
  });

  it("only continues your own conversation", async () => {
    const { ctx, db } = setup();
    db.agentConversation.findFirst.mockResolvedValue(null);
    await expect(
      sendMessage(ctx, artist, user, { conversationId: "theirs", text: "hello there" }),
    ).rejects.toThrow(/not found/);
  });

  it("shows live steps, then the saved answer", async () => {
    const { ctx, db } = setup();
    db.agentJob.findFirst.mockResolvedValueOnce({
      status: "RUNNING",
      payload: { conversationId: "c1" },
      result: { steps: [{ id: "s", label: "Searching", status: "running" }] },
      updatedAt: new Date(),
    });
    expect(await pollRun(ctx, artist, user, "aj1")).toMatchObject({
      status: "RUNNING",
      steps: [{ label: "Searching" }],
      message: null,
    });
    db.agentJob.findFirst.mockResolvedValueOnce({
      status: "SUCCEEDED",
      payload: { conversationId: "c1" },
      result: { steps: [], messageId: "m9" },
      updatedAt: new Date(),
    });
    db.agentMessage.findFirst.mockResolvedValueOnce({
      id: "m9",
      role: "assistant",
      text: "Found 3 parks",
      blocks: [],
      steps: [],
      createdAt: new Date(),
    });
    expect(await pollRun(ctx, artist, user, "aj1")).toMatchObject({
      status: "SUCCEEDED",
      message: { id: "m9", role: "assistant", text: "Found 3 parks" },
    });
  });

  it("calls a run nobody finished failed, in plain words", async () => {
    const { ctx, db } = setup();
    db.agentJob.findFirst.mockResolvedValue({
      status: "RUNNING",
      payload: { conversationId: "c1" },
      result: null,
      updatedAt: new Date(Date.now() - 11 * 60_000),
    });
    expect(await pollRun(ctx, artist, user, "aj1")).toMatchObject({
      status: "FAILED",
      error: "The assistant couldn't finish. Please try again.",
    });
  });

  describe("proposals", () => {
    const proposal = {
      id: "act1",
      payload: { type: "hide_pins", pins: [{ id: "x", title: "A" }] },
    };

    it("runs a pending proposal once and records the result", async () => {
      const { ctx, db } = setup();
      db.agentAction.findFirst.mockResolvedValue(proposal);
      db.agentAction.updateMany.mockResolvedValue({ count: 1 });
      const done = await confirmAction(ctx, artist, user, { actionId: "act1" });
      expect(done).toMatchObject({ status: "done", message: "Hid 1 pin from the map." });
      expect(db.agentAction.update).toHaveBeenCalledWith({
        where: { id: "act1" },
        data: { status: "done", result: { message: "Hid 1 pin from the map." } },
      });
    });

    it("won't run a proposal twice", async () => {
      const { ctx, db } = setup();
      db.agentAction.findFirst.mockResolvedValue(proposal);
      db.agentAction.updateMany.mockResolvedValue({ count: 0 });
      await expect(confirmAction(ctx, artist, user, { actionId: "act1" })).rejects.toThrow(
        /already handled/,
      );
      expect(svc.setPinHidden).not.toHaveBeenCalled();
    });

    it("lets a bad card edit be fixed and tried again, but keeps other failures failed", async () => {
      const { ctx, db } = setup();
      db.agentAction.findFirst.mockResolvedValue(proposal);
      db.agentAction.updateMany.mockResolvedValue({ count: 1 });
      svc.setPinHidden.mockRejectedValueOnce(
        new AppError(ErrorCodes.VALIDATION_FAILED, { message: "Bad title" }),
      );
      await expect(confirmAction(ctx, artist, user, { actionId: "act1" })).rejects.toThrow(
        "Bad title",
      );
      expect(db.agentAction.update).toHaveBeenLastCalledWith({
        where: { id: "act1" },
        data: { status: "pending", result: { message: "Bad title" } },
      });
      svc.setPinHidden.mockRejectedValueOnce(
        new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Gone" }),
      );
      await expect(confirmAction(ctx, artist, user, { actionId: "act1" })).rejects.toThrow("Gone");
      expect(db.agentAction.update).toHaveBeenLastCalledWith({
        where: { id: "act1" },
        data: { status: "failed", result: { message: "Gone" } },
      });
    });

    it("only acts on your own proposals, and cancels only pending ones", async () => {
      const { ctx, db } = setup();
      db.agentAction.findFirst.mockResolvedValue(null);
      await expect(confirmAction(ctx, artist, user, { actionId: "x" })).rejects.toThrow(
        /not found/,
      );
      db.agentAction.updateMany.mockResolvedValue({ count: 0 });
      await expect(cancelAction(ctx, artist, user, "x")).rejects.toThrow(/already handled/);
      db.agentAction.updateMany.mockResolvedValue({ count: 1 });
      expect(await cancelAction(ctx, artist, user, "act1")).toEqual({ status: "cancelled" });
    });
  });
});
