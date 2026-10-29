import { describe, expect, it, vi } from "vitest";

import type { Db } from "@bandcoin/db";

import { collectionSummary, exportCollections, pinReport, previousPeriod } from "../services/artist/reports";

const artist = { id: "a1" };
const now = new Date("2026-11-03T12:00:00Z");

const pin = {
  id: "p1",
  title: "Secret show",
  description: "By the fountain",
  imageUrl: null,
  type: "EXPERIENCE",
  link: null,
  isHidden: false,
  startsAt: new Date("2026-11-01T00:00:00Z"),
  endsAt: new Date("2026-11-09T00:00:00Z"),
  claimLimit: 10,
  claimsLeft: 7,
  spots: [
    { id: "s1", latitude: 1, longitude: 2, autoCollect: false, _count: { claims: 2 } },
    { id: "s2", latitude: 1.1, longitude: 2.1, autoCollect: true, _count: { claims: 1 } },
  ],
};

const claim = (id: string, user: Record<string, unknown>) => ({ id, createdAt: new Date("2026-11-02T10:00:00Z"), claimedAt: null, isRedeemed: false, redeemedAt: null, spotId: "s1", user });

function setup(found: unknown = pin) {
  const db = {
    pin: { findFirst: vi.fn().mockResolvedValue(found) },
    pinClaim: {
      findMany: vi.fn().mockResolvedValue([
        claim("c1", { id: "u1", username: "ana", displayName: "Ana B", avatarUrl: "https://x/a.png", email: "ana@example.com", walletAddress: "GABC" }),
        claim("c2", { id: "u2", username: "bo", displayName: null, avatarUrl: null, email: null, walletAddress: null }),
      ]),
    },
    $queryRaw: vi.fn().mockResolvedValue([{ day: "2026-11-02", n: 3 }]),
  };
  return { ctx: { db: db as unknown as Db }, db };
}

describe("pinReport", () => {
  it("only finds the artist's own pin", async () => {
    const { ctx, db } = setup(null);
    await expect(pinReport(ctx, artist, "p9")).rejects.toThrow(/Pin not found/);
    expect(db.pin.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "p9", artistId: "a1" } }));
  });

  it("gives the pin's status, spots with their counts, daily numbers and collectors", async () => {
    const { ctx } = setup();
    const report = await pinReport(ctx, artist, "p1", now);
    expect(report).toMatchObject({ id: "p1", status: "LIVE", claimLimit: 10, claimsLeft: 7 });
    expect(report.spots.map((spot) => [spot.id, spot.collected])).toEqual([["s1", 2], ["s2", 1]]);
    expect(report.daily).toEqual([{ day: "2026-11-02", n: 3 }]);
    expect(report.collectors[0]?.user).toEqual({ id: "u1", name: "Ana B", image: "https://x/a.png", email: "ana@example.com", wallet: "GABC" });
  });

  it("names a collector by username when they have no display name", async () => {
    const { ctx } = setup();
    const report = await pinReport(ctx, artist, "p1", now);
    expect(report.collectors[1]?.user.name).toBe("bo");
  });

  it("leaves out hidden claims and hidden spots", async () => {
    const { ctx, db } = setup();
    await pinReport(ctx, artist, "p1", now);
    expect(db.pinClaim.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isHidden: false, spot: { pinId: "p1", isHidden: false } }, take: 1000 }));
  });

  it("says a hidden pin is hidden", async () => {
    const { ctx } = setup({ ...pin, isHidden: true });
    expect((await pinReport(ctx, artist, "p1", now)).status).toBe("HIDDEN");
  });
});

describe("previousPeriod", () => {
  it("is the same-length window right before this one", () => {
    const prev = previousPeriod({ from: new Date("2026-11-08T00:00:00Z"), to: new Date("2026-11-10T00:00:00Z") });
    expect(prev?.from?.toISOString()).toBe("2026-11-06T00:00:00.000Z");
    expect(prev?.to?.getTime()).toBe(new Date("2026-11-08T00:00:00Z").getTime() - 1);
  });

  it("runs to now when the period is open-ended, and is absent for all time", () => {
    const now = new Date("2026-11-10T00:00:00Z");
    expect(previousPeriod({ from: new Date("2026-11-08T00:00:00Z") }, now)?.from?.toISOString()).toBe("2026-11-06T00:00:00.000Z");
    expect(previousPeriod({}, now)).toBeNull();
  });
});

describe("collectionSummary", () => {
  function summaryDb() {
    const queries = [
      [{ collections: 5, collectors: 3, redeemed: 1 }],
      [{ collections: 2, collectors: 2, redeemed: 0 }],
      [{ day: "2026-11-02", n: 5 }],
      [{ pinId: "p1", n: 5, users: 3, last: new Date("2026-11-02T10:00:00Z") }],
      [{ id: "u1", name: "Ana", image: null, wallet: "GABC", n: 3 }],
    ];
    const db = {
      $queryRaw: vi.fn(() => Promise.resolve(queries.shift())),
      pin: {
        findMany: vi.fn().mockResolvedValue([
          { ...pin, createdAt: new Date("2026-10-30T00:00:00Z"), _count: { spots: 2 } },
          { ...pin, id: "p2", title: "Quiet one", createdAt: new Date("2026-10-29T00:00:00Z"), _count: { spots: 1 } },
        ]),
      },
    };
    return { ctx: { db: db as unknown as Db }, db };
  }

  it("adds each pin's numbers, with zeros for pins nobody collected", async () => {
    const { ctx } = summaryDb();
    const summary = await collectionSummary(ctx, artist, { from: new Date("2026-11-01T00:00:00Z") }, now);
    expect(summary.totals).toEqual({ collections: 5, collectors: 3, redeemed: 1 });
    expect(summary.previous).toEqual({ collections: 2, collectors: 2, redeemed: 0 });
    expect(summary.pins.map((p) => [p.id, p.status, p.spots, p.collected, p.collectors])).toEqual([
      ["p1", "LIVE", 2, 5, 3],
      ["p2", "LIVE", 1, 0, 0],
    ]);
    expect(summary.pins[1]?.lastCollected).toBeNull();
    expect(summary.collectors[0]?.name).toBe("Ana");
  });

  it("skips the comparison for all time and only lists the artist's own live pins", async () => {
    const { ctx, db } = summaryDb();
    db.$queryRaw.mockReset();
    db.$queryRaw.mockResolvedValue([]);
    const summary = await collectionSummary(ctx, artist, {}, now);
    expect(summary.previous).toBeNull();
    expect(summary.totals).toEqual({ collections: 0, collectors: 0, redeemed: 0 });
    expect(db.pin.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { artistId: "a1", isHidden: false } }));
  });
});

describe("exportCollections", () => {
  it("returns the rows from one scoped query", async () => {
    const rows = [{ pin: "Secret show", pinId: "p1", lat: 1, lng: 2, wallet: "GABC", name: "Ana", email: "ana@example.com", collectedAt: now, redeemed: false }];
    const db = { $queryRaw: vi.fn().mockResolvedValue(rows) };
    await expect(exportCollections({ db: db as unknown as Db }, artist, {}, "p1")).resolves.toEqual(rows);
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
