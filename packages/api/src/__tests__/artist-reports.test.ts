import { describe, expect, it, vi } from "vitest";

import type { Db } from "@bandcoin/db";

import { pinReport } from "../services/artist/reports";

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
