import { describe, expect, it, vi } from "vitest";

import { addRoom, moveSlotToCell, removeRoom, saveSlot, swapSlots, toggleLike } from "..";
import { cellOf, isSlotId, SLOT_IDS, wallSlot } from "../slots";

const ORG = "org1";
const ctxOf = (db: object) => ({ db }) as never;

describe("slots", () => {
  it("knows the 18 frames of a room and nothing else", () => {
    expect(SLOT_IDS).toHaveLength(18);
    expect(isSlotId("m-back-3")).toBe(true);
    expect(isSlotId("m-p2-s")).toBe(true);
    expect(isSlotId("m-back-4")).toBe(false);
    expect(isSlotId("anything")).toBe(false);
  });

  it("only front and back frames sit on a wall grid, and hang in their own cell until moved", () => {
    expect(wallSlot("m-front-2")).toEqual({ wall: "front", defaultCell: 2 });
    expect(wallSlot("m-east-near")).toBeNull();
    expect(cellOf("m-back-1", null)).toBe(1);
    expect(cellOf("m-back-1", 3)).toBe(3);
  });
});

describe("moving frames", () => {
  const db = (over: object = {}) => ({
    museumRoom: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn() },
    gallerySlotOverride: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue({ id: "x" }),
    },
    ...over,
  });

  it("moves a wall frame to a free cell", async () => {
    const d = db();
    await moveSlotToCell(ctxOf(d), ORG, { slotId: "m-front-0", targetCell: 2, roomIndex: 0 });
    expect(d.gallerySlotOverride.upsert.mock.calls[0]![0].update).toEqual({ gridCell: 2 });
  });

  it("refuses a cell another frame already holds, including one that never moved", async () => {
    const d = db();
    d.gallerySlotOverride.findMany.mockResolvedValue([
      { slotId: "m-front-2", gridCell: null, imageUrl: "https://x/p.png" },
    ]);
    await expect(
      moveSlotToCell(ctxOf(d), ORG, { slotId: "m-front-0", targetCell: 2, roomIndex: 0 }),
    ).rejects.toThrow(/already has a frame/);
  });

  it("refuses a cell with a door in it", async () => {
    const d = db();
    d.museumRoom.findMany.mockResolvedValue([{ roomIndex: 0, northDoorCell: 1 }]);
    await expect(
      moveSlotToCell(ctxOf(d), ORG, { slotId: "m-back-0", targetCell: 1, roomIndex: 0 }),
    ).rejects.toThrow(/door/);
  });

  it("refuses to move side-wall frames, unknown slots and missing rooms", async () => {
    const d = db();
    await expect(
      moveSlotToCell(ctxOf(d), ORG, { slotId: "m-east-near", targetCell: 1, roomIndex: 0 }),
    ).rejects.toThrow(/front and back/);
    await expect(
      moveSlotToCell(ctxOf(d), ORG, { slotId: "nope", targetCell: 1, roomIndex: 0 }),
    ).rejects.toThrow(/isn't a slot/);
    d.museumRoom.findUnique.mockResolvedValue(null);
    await expect(saveSlot(ctxOf(d), ORG, { slotId: "m-front-0", roomIndex: 4 })).rejects.toThrow(
      /room doesn't exist/,
    );
  });
});

describe("swapSlots", () => {
  it("swaps what two frames show and keeps where they hang", async () => {
    const row = (id: string, title: string) => ({
      id,
      slotId: id,
      title,
      imageUrl: null,
      description: null,
      aspectRatio: null,
      photoDescription: null,
      photoDescPlacement: null,
      gridCell: 1,
    });
    const update = vi.fn((x: unknown) => x);
    const d = {
      gallerySlotOverride: {
        findMany: vi.fn().mockResolvedValue([row("m-front-0", "A"), row("m-front-1", "B")]),
        update,
      },
      $transaction: vi.fn().mockResolvedValue([]),
    };
    expect(
      await swapSlots(ctxOf(d), ORG, { slotIdA: "m-front-0", slotIdB: "m-front-1", roomIndex: 0 }),
    ).toEqual({ swapped: true });
    const data = update.mock.calls.map((c) => (c[0] as { data: object }).data);
    expect(data[0]).toMatchObject({ title: "B" });
    expect(data[0]).not.toHaveProperty("gridCell");
  });

  it("needs both frames to have something", async () => {
    const d = {
      gallerySlotOverride: {
        findMany: vi.fn().mockResolvedValue([{ id: "1", slotId: "m-front-0" }]),
      },
    };
    await expect(
      swapSlots(ctxOf(d), ORG, { slotIdA: "m-front-0", slotIdB: "m-front-1", roomIndex: 0 }),
    ).rejects.toThrow(/both frames/i);
  });
});

describe("rooms", () => {
  const roomDb = (rooms: object[], frames: object[] = []) => {
    const tx = {
      museumRoom: { update: vi.fn(), create: vi.fn().mockResolvedValue({ id: "r", roomIndex: 1 }) },
    };
    return {
      tx,
      db: {
        museumRoom: { findMany: vi.fn().mockResolvedValue(rooms) },
        gallerySlotOverride: { findMany: vi.fn().mockResolvedValue(frames) },
        $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      },
    };
  };

  it("adds the first extra room: room 1 gets its door, room 2 is created", async () => {
    const { db, tx } = roomDb([]);
    await addRoom(ctxOf(db), ORG, 3);
    expect(tx.museumRoom.create.mock.calls[0]![0].data).toMatchObject({
      roomIndex: 0,
      northDoorCell: 3,
    });
    expect(tx.museumRoom.create.mock.calls[1]![0].data).toMatchObject({
      roomIndex: 1,
      label: "Room 2",
    });
  });

  it("won't put a door where a frame hangs", async () => {
    const { db } = roomDb(
      [],
      [{ slotId: "m-back-3", gridCell: null, imageUrl: "https://x/p.png" }],
    );
    await expect(addRoom(ctxOf(db), ORG, 3)).rejects.toThrow(/has a frame/);
  });

  it("refuses to remove a room when there is only one", async () => {
    const { db } = roomDb([]);
    await expect(removeRoom(ctxOf(db), ORG)).rejects.toThrow();
  });
});

describe("likes", () => {
  const likeDb = (existing: object | null) => ({
    organization: { findFirst: vi.fn().mockResolvedValue({ id: ORG }) },
    museumRoom: { findUnique: vi.fn() },
    gallerySlotLike: {
      findUnique: vi.fn().mockResolvedValue(existing),
      create: vi.fn(),
      delete: vi.fn(),
      count: vi.fn().mockResolvedValue(3),
    },
  });
  const input = { organizationId: ORG, slotId: "m-front-0", roomIndex: 0 };

  it("likes, then un-likes, and says the count", async () => {
    const d = likeDb(null);
    expect(await toggleLike(ctxOf(d), "u1", input)).toEqual({ liked: true, count: 3 });
    expect(d.gallerySlotLike.create).toHaveBeenCalled();
    const e = likeDb({ id: "l" });
    expect(await toggleLike(ctxOf(e), "u1", input)).toEqual({ liked: false, count: 3 });
    expect(e.gallerySlotLike.delete).toHaveBeenCalled();
  });

  it("only for approved artists' real slots", async () => {
    const d = likeDb(null);
    d.organization.findFirst.mockResolvedValue(null);
    await expect(toggleLike(ctxOf(d), "u1", input)).rejects.toThrow(/doesn't exist/);
    await expect(
      toggleLike(ctxOf(likeDb(null)), "u1", { ...input, slotId: "bad" }),
    ).rejects.toThrow(/isn't a slot/);
  });
});
