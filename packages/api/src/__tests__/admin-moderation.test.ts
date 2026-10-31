import { describe, expect, it, vi } from "vitest";

import type { Db } from "@bandcoin/db";

import { listBounties, setBountyHidden } from "../services/admin/bounties";
import { listItems, setItemHidden } from "../services/admin/items";
import { decidePins, deletePins, listPins, pinCounts, pinsForMap } from "../services/admin/pins";

const now = new Date("2026-10-30T12:00:00Z");
const day = 24 * 60 * 60 * 1000;

function ctxWith(db: Record<string, unknown>) {
  const activity = { set: vi.fn(), facts: () => ({}) };
  return { ctx: { db: db as unknown as Db, activity }, activity };
}

const pinRow = (extra: Record<string, unknown>) => ({
  id: "p1",
  title: "Rooftop",
  type: "OTHER",
  description: null,
  imageUrl: null,
  isHidden: false,
  startsAt: new Date(now.getTime() - day),
  endsAt: new Date(now.getTime() + day),
  claimLimit: 10,
  claimsLeft: 7,
  latitude: 0,
  longitude: 0,
  radiusMeters: 50,
  createdAt: now,
  artist: { id: "a1", name: "Luna", userId: "u1", avatarUrl: null },
  _count: { spots: 1 },
  ...extra,
});

describe("admin pin review", () => {
  it("lists the waiting pins oldest first, with timing and how many were collected", async () => {
    const findMany = vi
      .fn()
      .mockResolvedValue([pinRow({}), pinRow({ id: "p3", endsAt: new Date(now.getTime() - 1) })]);
    const { ctx } = ctxWith({ pin: { findMany } });
    const page = await listPins(ctx, { view: "pending", search: "luna" }, now);
    expect(page.pins.map((pin) => [pin.id, pin.timing, pin.claimed])).toEqual([
      ["p1", "running", 3],
      ["p3", "ended", 3],
    ]);
    const query = findMany.mock.calls[0]?.[0];
    expect(query.where).toMatchObject({ approval: "PENDING" });
    expect(query.where.OR).toHaveLength(4);
    expect(query.orderBy).toEqual([{ createdAt: "asc" }, { id: "asc" }]);
    await listPins(ctx, { view: "approved" }, now);
    expect(findMany.mock.calls[1]?.[0].where).toEqual({ approval: "APPROVED" });
    expect(findMany.mock.calls[1]?.[0].orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
  });

  it("counts each list", async () => {
    const groupBy = vi.fn().mockResolvedValue([
      { approval: "PENDING", _count: { _all: 4 } },
      { approval: "APPROVED", _count: { _all: 9 } },
    ]);
    const { ctx } = ctxWith({ pin: { groupBy } });
    expect(await pinCounts(ctx)).toEqual({ pending: 4, approved: 9, rejected: 0 });
  });

  it("approves, rejects and moves pins back to review in bulk, logging them", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 2 });
    const { ctx, activity } = ctxWith({ pin: { updateMany } });
    await decidePins(ctx, { pinIds: ["p1", "p2"], approval: "APPROVED" });
    expect(updateMany).toHaveBeenLastCalledWith({
      where: { id: { in: ["p1", "p2"] } },
      data: { approval: "APPROVED" },
    });
    expect(activity.set).toHaveBeenCalledWith({ targetType: "Pin", targetId: "p1,p2" });
    await decidePins(ctx, { pinIds: ["p1"], approval: "PENDING" });
    expect(updateMany).toHaveBeenLastCalledWith({
      where: { id: { in: ["p1"] } },
      data: { approval: "PENDING" },
    });
  });

  it("says so when none of the pins exist", async () => {
    const { ctx } = ctxWith({ pin: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) } });
    await expect(decidePins(ctx, { pinIds: ["gone"], approval: "REJECTED" })).rejects.toThrow(
      /Pin not found/,
    );
  });

  it("deletes only pins nobody collected", async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 2 });
    const count = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    const { ctx } = ctxWith({ pin: { count, deleteMany } });
    await expect(deletePins(ctx, { pinIds: ["p1", "p2"] })).rejects.toThrow(
      /collected 1 of these pins/,
    );
    expect(deleteMany).not.toHaveBeenCalled();
    expect(await deletePins(ctx, { pinIds: ["p1", "p2"] })).toEqual({ count: 2 });
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["p1", "p2"] } } });
  });
});

describe("admin pin map", () => {
  it("draws every artist's pins with the artist's status, leaving out ended ones unless asked", async () => {
    const spot = (id: string, claims: number) => ({
      id,
      latitude: 1,
      longitude: 2,
      autoCollect: false,
      _count: { claims },
    });
    const findMany = vi.fn().mockResolvedValue([
      { ...pinRow({ approval: "PENDING" }), spots: [spot("s1", 2), spot("s2", 1)] },
      { ...pinRow({ id: "p2", approval: "APPROVED" }), spots: [spot("s3", 0)] },
    ]);
    const { ctx } = ctxWith({ pin: { findMany } });
    const { pins, capped } = await pinsForMap(ctx, {}, now);
    expect(pins.map((pin) => [pin.id, pin.status, pin.collected, pin.spotPoints.length])).toEqual([
      ["p1", "IN_REVIEW", 3, 2],
      ["p2", "LIVE", 0, 1],
    ]);
    expect(capped).toBe(false);
    expect(findMany.mock.calls[0]?.[0].where).toEqual({ endsAt: { gte: now } });
    await pinsForMap(ctx, { artistId: "a1", includeEnded: true }, now);
    expect(findMany.mock.calls[1]?.[0].where).toEqual({ artistId: "a1" });
  });
});

describe("admin bounties", () => {
  it("shows where each prize is: draft, held in escrow, or paid out", async () => {
    const row = (extra: Record<string, unknown>) => ({
      id: "b1",
      title: "Cover contest",
      prizeAmount: { toString: () => "500" },
      prizeCurrency: "BANDCOIN",
      maxWinners: 1,
      status: "RUNNING",
      fundTxHash: "tx",
      fundedFromStorage: false,
      hiddenAt: null,
      hiddenReason: null,
      createdAt: now,
      artist: { id: "a1", name: "Luna", userId: "u1" },
      _count: { participants: 4, submissions: 2, winners: 0 },
      ...extra,
    });
    const { ctx } = ctxWith({
      bounty: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            row({}),
            row({ id: "b2", fundTxHash: null }),
            row({ id: "b3", status: "COMPLETED", hiddenAt: now, hiddenReason: "Spam" }),
          ]),
      },
    });
    const page = await listBounties(ctx, {});
    expect(page.bounties.map((b) => [b.id, b.escrow])).toEqual([
      ["b1", "held"],
      ["b2", "draft"],
      ["b3", "paid"],
    ]);
    expect(page.bounties[2]?.hidden).toEqual({ at: now, reason: "Spam" });
  });

  it("hides with a reason and shows again, never touching the escrow", async () => {
    const update = vi.fn().mockResolvedValue({});
    const { ctx } = ctxWith({
      bounty: { findUnique: vi.fn().mockResolvedValue({ id: "b1" }), update },
    });
    await setBountyHidden(ctx, { bountyId: "b1", hidden: true, reason: " Misleading " });
    expect(update.mock.calls[0]?.[0].data).toMatchObject({ hiddenReason: "Misleading" });
    expect(Object.keys(update.mock.calls[0]?.[0].data)).toEqual(["hiddenAt", "hiddenReason"]);
    await setBountyHidden(ctx, { bountyId: "b1", hidden: false });
    expect(update.mock.calls[1]?.[0].data).toEqual({ hiddenAt: null, hiddenReason: null });
  });
});

describe("admin items", () => {
  it("lists items with price, sold and state", async () => {
    const { ctx } = ctxWith({
      item: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "i1",
            title: "Song",
            slug: "song",
            type: "TRACK",
            chainType: "CLASSIC_TOKEN",
            coverUrl: "c",
            supply: 100,
            visibility: "PUBLIC",
            hiddenAt: null,
            hiddenReason: null,
            createdAt: now,
            artist: { id: "a1", name: "Luna", userId: "u1" },
            classicToken: { code: "SONG1" },
            listings: [
              {
                priceBandcoin: { toString: () => "10" },
                priceUsd: { toString: () => "1" },
                quantitySold: 4,
                status: "ACTIVE",
              },
            ],
          },
        ]),
      },
    });
    const page = await listItems(ctx, { status: "listed" });
    expect(page.items[0]).toMatchObject({
      code: "SONG1",
      price: { bandcoin: "10", usd: "1" },
      sold: 4,
      supply: 100,
      status: "listed",
    });
  });

  it("hides a live item and refuses a deleted one", async () => {
    const update = vi.fn().mockResolvedValue({});
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce({ id: "i1", deletedAt: null })
      .mockResolvedValueOnce({ id: "i2", deletedAt: now });
    const { ctx, activity } = ctxWith({ item: { findUnique, update } });
    await setItemHidden(ctx, { itemId: "i1", hidden: true, reason: "Stolen art" });
    expect(update.mock.calls[0]?.[0].data).toMatchObject({ hiddenReason: "Stolen art" });
    expect(activity.set).toHaveBeenCalledWith({ targetType: "Item", targetId: "i1" });
    await expect(setItemHidden(ctx, { itemId: "i2", hidden: true })).rejects.toThrow(/not found/);
  });
});
