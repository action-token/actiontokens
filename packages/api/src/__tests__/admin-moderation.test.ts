import { describe, expect, it, vi } from "vitest";

import type { Db } from "@bandcoin/db";

import { listBounties, setBountyHidden } from "../services/admin/bounties";
import { listItems, setItemHidden } from "../services/admin/items";
import { deletePin, listPins, setPinHidden } from "../services/admin/pins";

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
  imageUrl: null,
  approval: "APPROVED",
  isHidden: false,
  startsAt: new Date(now.getTime() - day),
  endsAt: new Date(now.getTime() + day),
  claimLimit: 10,
  claimsLeft: 7,
  latitude: 0,
  longitude: 0,
  createdAt: now,
  artist: { id: "a1", name: "Luna", userId: "u1" },
  _count: { spots: 1 },
  ...extra,
});

describe("admin pins", () => {
  it("lists pins with their state and how many were collected", async () => {
    const findMany = vi
      .fn()
      .mockResolvedValue([
        pinRow({}),
        pinRow({ id: "p2", approval: "REJECTED" }),
        pinRow({ id: "p3", endsAt: new Date(now.getTime() - 1) }),
      ]);
    const { ctx } = ctxWith({ pin: { findMany } });
    const page = await listPins(ctx, { status: "live" }, now);
    expect(page.pins.map((pin) => [pin.id, pin.status, pin.claimed])).toEqual([
      ["p1", "live", 3],
      ["p2", "hidden", 3],
      ["p3", "ended", 3],
    ]);
    expect(findMany.mock.calls[0]?.[0].where).toMatchObject({
      approval: "APPROVED",
      startsAt: { lte: now },
      endsAt: { gte: now },
    });
  });

  it("hides and shows a pin through approval, which artists can't change", async () => {
    const update = vi.fn().mockResolvedValue({});
    const { ctx, activity } = ctxWith({
      pin: { findUnique: vi.fn().mockResolvedValue({ id: "p1" }), update },
    });
    await setPinHidden(ctx, { pinId: "p1", hidden: true });
    expect(update).toHaveBeenLastCalledWith({
      where: { id: "p1" },
      data: { approval: "REJECTED" },
    });
    await setPinHidden(ctx, { pinId: "p1", hidden: false });
    expect(update).toHaveBeenLastCalledWith({
      where: { id: "p1" },
      data: { approval: "APPROVED" },
    });
    expect(activity.set).toHaveBeenCalledWith({ targetType: "Pin", targetId: "p1" });
  });

  it("deletes only a pin nobody collected", async () => {
    const remove = vi.fn().mockResolvedValue({});
    const count = vi.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(0);
    const { ctx } = ctxWith({
      pin: { findUnique: vi.fn().mockResolvedValue({ id: "p1" }), delete: remove },
      pinClaim: { count },
    });
    await expect(deletePin(ctx, { pinId: "p1" })).rejects.toThrow(/collected this pin 2 times/);
    expect(remove).not.toHaveBeenCalled();
    await deletePin(ctx, { pinId: "p1" });
    expect(remove).toHaveBeenCalledWith({ where: { id: "p1" } });
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
