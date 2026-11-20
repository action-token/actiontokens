import { describe, expect, it, vi } from "vitest";

import type { Db } from "@actiontokens/db";

import { ensureUnlockPins, moveUnlockPins } from "../services/catalog/unlock-pins";

type Row = Record<string, unknown>;

function setup(existing: Row[] = [], clash = false) {
  const made: Row[] = [];
  const db = {
    item: {
      findUnique: vi.fn().mockResolvedValue({
        title: "VIP pass",
        coverUrl: "https://cdn.example/c.jpg",
        organizationId: "a1",
      }),
    },
    lockedContent: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "lc-video",
          label: "Backstage video",
          unlockRule: {
            radiusMeters: 80,
            points: [
              { latitude: 23.78, longitude: 90.4 },
              { latitude: 23.79, longitude: 90.41 },
            ],
          },
        },
      ]),
    },
    pin: {
      findMany: vi.fn().mockResolvedValue(existing),
      create: vi.fn(({ data }: { data: Row }) => {
        if (clash) return Promise.reject(Object.assign(new Error("unique"), { code: "P2002" }));
        made.push(data);
        return Promise.resolve({ id: `pin${made.length}` });
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 2 }),
    },
  };
  return { db, made };
}

const now = new Date("2026-11-01T12:00:00Z");

describe("unlock pins", () => {
  it("makes one private pin per copy and gated piece, a spot per place, collected one by one", async () => {
    const { db, made } = setup();
    await expect(
      ensureUnlockPins(
        db as unknown as Db,
        "i1",
        [
          { id: "e1", ownerId: "fan" },
          { id: "e2", ownerId: "fan" },
        ],
        now,
      ),
    ).resolves.toBe(2);
    expect(made[0]).toMatchObject({
      organizationId: "a1",
      title: "Unlock: Backstage video",
      approval: "APPROVED",
      restrictedToUserId: "fan",
      unlockItemId: "i1",
      unlockEditionId: "e1",
      unlockLockedContentId: "lc-video",
      isMultiSpot: true,
      claimLimit: 0,
      radiusMeters: 80,
      latitude: 23.78,
      startsAt: now,
      endsAt: new Date("2031-11-01T12:00:00Z"),
      spots: {
        create: [
          { latitude: 23.78, longitude: 90.4 },
          { latitude: 23.79, longitude: 90.41 },
        ],
      },
    });
  });

  it("only fills in what's missing, and takes a race calmly", async () => {
    const { db, made } = setup([{ unlockEditionId: "e1", unlockLockedContentId: "lc-video" }]);
    await ensureUnlockPins(
      db as unknown as Db,
      "i1",
      [
        { id: "e1", ownerId: "fan" },
        { id: "e2", ownerId: "fan" },
      ],
      now,
    );
    expect(made.map((pin) => pin.unlockEditionId)).toEqual(["e2"]);
    const raced = setup([], true);
    await expect(
      ensureUnlockPins(raced.db as unknown as Db, "i1", [{ id: "e1", ownerId: "fan" }], now),
    ).resolves.toBe(0);
  });

  it("follows the copy to its new owner", async () => {
    const { db } = setup();
    await moveUnlockPins(db as unknown as Db, "e1", "new-owner");
    expect(db.pin.updateMany).toHaveBeenCalledWith({
      where: { unlockEditionId: "e1" },
      data: { restrictedToUserId: "new-owner" },
    });
  });
});
