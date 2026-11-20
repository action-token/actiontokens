import { describe, expect, it, vi } from "vitest";

import type { Db } from "@actiontokens/db";

import { lockedForOwner, lockedPreview } from "../services/catalog/locked-view";

const pieces = [
  {
    id: "song",
    type: "SONG",
    label: "Bonus track",
    chainIndex: 0,
    url: "https://cdn.example/bonus.mp3",
    unlockRule: null,
  },
  {
    id: "video",
    type: "VIDEO",
    label: "Backstage",
    chainIndex: 1,
    url: "https://cdn.example/backstage.mp4",
    unlockRule: {
      radiusMeters: 80,
      points: [
        { latitude: 1, longitude: 2, label: "Gate A" },
        { latitude: 3, longitude: 4, label: null },
      ],
    },
  },
];

function setup({ owned = true, visited = [1, 0] } = {}) {
  const db = {
    lockedContent: {
      // Prisma returns only what was selected: drop the link unless it was asked for.
      findMany: vi.fn(({ select }: { select: Record<string, unknown> }) =>
        Promise.resolve(pieces.map(({ url, ...rest }) => (select.url ? { ...rest, url } : rest))),
      ),
    },
    nftEdition: {
      findMany: vi
        .fn()
        .mockResolvedValue(owned ? [{ id: "e1", tokenId: "40", ownerId: "fan" }] : []),
    },
    lockedContentRedeem: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn(({ data }: { data: { lockedContentId: string } }) =>
        Promise.resolve({ code: `CODE-${data.lockedContentId}`, redeemedAt: null }),
      ),
    },
    pinClaim: { findFirst: vi.fn().mockResolvedValue(null) },
    item: {
      findUnique: vi.fn().mockResolvedValue({ title: "VIP", coverUrl: null, artistId: "a1" }),
    },
    pin: {
      findMany: vi.fn().mockResolvedValue([
        {
          unlockEditionId: "e1",
          unlockLockedContentId: "video",
          onChainUnlockedAt: null,
          onChainUnlockTxHash: null,
          spots: visited.map((claims) => ({ _count: { claims } })),
        },
      ]),
      create: vi.fn(),
    },
  };
  return db as unknown as Db & typeof db;
}

describe("locked content for fans", () => {
  it("tells anyone what's locked and where, but never the links", async () => {
    const preview = await lockedPreview(setup(), "i1");
    expect(JSON.stringify(preview)).not.toContain("https://");
    expect(preview[1]).toEqual({
      id: "video",
      type: "VIDEO",
      label: "Backstage",
      unlock: {
        radiusMeters: 80,
        places: [
          { lat: 1, lng: 2, label: "Gate A" },
          { lat: 3, lng: 4, label: null },
        ],
      },
    });
  });

  it("gives an owner each copy's progress, and a link only once a piece is unlocked", async () => {
    const { copies } = await lockedForOwner(setup(), "fan", "i1");
    expect(copies).toHaveLength(1);
    expect(
      copies[0]!.pieces.map((p) => [p.id, p.visited, p.required, p.unlocked, p.url, p.code?.code]),
    ).toEqual([
      ["song", 0, 0, true, "https://cdn.example/bonus.mp3", "CODE-song"],
      ["video", 1, 2, false, null, undefined],
    ]);
    const done = await lockedForOwner(setup({ visited: [1, 3] }), "fan", "i1");
    expect(done.copies[0]!.pieces[1]).toMatchObject({
      unlocked: true,
      url: "https://cdn.example/backstage.mp4",
    });
  });

  it("gives someone without a copy nothing", async () => {
    const db = setup({ owned: false });
    await expect(lockedForOwner(db, "fan", "i1")).resolves.toEqual({ copies: [] });
    expect(db.lockedContent.findMany).not.toHaveBeenCalled();
  });
});
