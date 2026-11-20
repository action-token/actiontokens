import { describe, expect, it, vi } from "vitest";

import type { Db } from "@actiontokens/db";

import {
  listRewards,
  lookupCode,
  normalizeCode,
  redeemCode,
  redeemHistory,
  redeemSummary,
} from "../services/artist/redeem";

const artist = { id: "a1" };
const aDate = expect.any(Date) as Date;

const claim = (over: Record<string, unknown> = {}) => ({
  id: "c1",
  redeemCode: "ABC234",
  isRedeemed: false,
  redeemedAt: null,
  claimedAt: new Date("2026-11-02T10:00:00Z"),
  createdAt: new Date("2026-11-02T09:59:00Z"),
  user: {
    id: "u1",
    username: "ana",
    displayName: "Ana B",
    avatarUrl: null,
    email: "ana@example.com",
  },
  spot: {
    latitude: 1,
    longitude: 2,
    pin: { id: "p1", title: "Signed poster", imageUrl: null, type: "LANDMARK" },
  },
  ...over,
});

function setup(found: unknown = claim(), updated = 1, content: unknown = null) {
  const db = {
    lockedContentRedeem: {
      findFirst: vi.fn().mockResolvedValue(content),
      updateMany: vi.fn().mockResolvedValue({ count: updated }),
    },
    pinClaim: {
      findFirst: vi.fn().mockResolvedValue(found),
      updateMany: vi.fn().mockResolvedValue({ count: updated }),
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    pin: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
    $queryRaw: vi.fn().mockResolvedValue([]),
  };
  const activity = { set: vi.fn() };
  return { ctx: { db: db as unknown as Db, activity } as never, db, activity };
}

describe("normalizeCode", () => {
  it("trims and upper-cases, and only accepts 6 letters and numbers", () => {
    expect(normalizeCode(" abc234 ")).toBe("ABC234");
    expect(() => normalizeCode("ABC")).toThrow(/6 letters and numbers/);
    expect(() => normalizeCode("ABC-23")).toThrow(/6 letters and numbers/);
  });
});

describe("lookupCode", () => {
  it("only looks at codes for the artist's own pins, so someone else's code is just not found", async () => {
    const { ctx, db } = setup(null);
    await expect(lookupCode(ctx, artist, "abc234")).resolves.toEqual({ status: "not_found" });
    expect(db.pinClaim.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { redeemCode: "ABC234", isHidden: false, spot: { pin: { artistId: "a1" } } },
      }),
    );
  });

  it("shows the fan and the reward before anything is redeemed", async () => {
    const { ctx } = setup();
    const result = await lookupCode(ctx, artist, "ABC234");
    expect(result).toMatchObject({
      status: "pending",
      claim: {
        code: "ABC234",
        fan: { name: "Ana B", email: "ana@example.com" },
        pin: { title: "Signed poster" },
      },
    });
  });

  it("says when a code was already redeemed", async () => {
    const { ctx } = setup(
      claim({ isRedeemed: true, redeemedAt: new Date("2026-11-03T00:00:00Z") }),
    );
    expect(await lookupCode(ctx, artist, "ABC234")).toMatchObject({ status: "already_redeemed" });
  });
});

describe("redeemCode", () => {
  it("redeems once and logs which claim it was", async () => {
    const { ctx, db, activity } = setup();
    const result = await redeemCode(ctx, artist, "abc234");
    expect(result).toMatchObject({ status: "success", claim: { redeemedAt: aDate } });
    expect(db.pinClaim.updateMany).toHaveBeenCalledWith({
      where: { id: "c1", isRedeemed: false },
      data: { isRedeemed: true, redeemedAt: aDate },
    });
    expect(activity.set).toHaveBeenCalledWith({ targetType: "PinClaim", targetId: "c1" });
  });

  it("does not redeem a code twice", async () => {
    const { ctx, db } = setup(claim({ isRedeemed: true, redeemedAt: new Date() }));
    expect(await redeemCode(ctx, artist, "ABC234")).toMatchObject({ status: "already_redeemed" });
    expect(db.pinClaim.updateMany).not.toHaveBeenCalled();
  });

  it("loses a race gracefully: the second redeemer sees it was already redeemed", async () => {
    const { ctx, db } = setup(claim(), 0);
    db.pinClaim.findFirst
      .mockResolvedValueOnce(claim())
      .mockResolvedValueOnce(claim({ isRedeemed: true, redeemedAt: new Date() }));
    expect(await redeemCode(ctx, artist, "ABC234")).toMatchObject({
      status: "already_redeemed",
      claim: { redeemedAt: aDate },
    });
  });

  it("finds nothing for a code that isn't theirs", async () => {
    const { ctx, db } = setup(null);
    expect(await redeemCode(ctx, artist, "ZZZ999")).toEqual({ status: "not_found" });
    expect(db.pinClaim.updateMany).not.toHaveBeenCalled();
  });
});

describe("redeemSummary", () => {
  it("counts rewards, redeemed and waiting for the artist's live pins", async () => {
    const { ctx, db } = setup();
    db.pin.count.mockResolvedValue(4);
    db.pinClaim.count.mockResolvedValueOnce(10).mockResolvedValueOnce(6);
    expect(await redeemSummary(ctx, artist)).toEqual({ rewards: 4, redeemed: 6, waiting: 4 });
  });
});

describe("listRewards", () => {
  it("pages pins, adds counts, and hands back a cursor when there is more", async () => {
    const { ctx, db } = setup();
    const pin = (id: string) => ({
      id,
      title: id,
      imageUrl: null,
      type: "EVENT",
      startsAt: new Date(),
      endsAt: new Date(),
      claimLimit: 0,
      spots: [{ id: `${id}s` }],
    });
    db.pin.count.mockResolvedValue(3);
    db.pin.findMany.mockResolvedValue([pin("p1"), pin("p2"), pin("p3")]);
    db.$queryRaw.mockResolvedValue([{ pinId: "p1", collected: 4, redeemed: 1 }]);
    const result = await listRewards(ctx, artist, { limit: 2 });
    expect(result.items.map((item) => [item.id, item.collected, item.redeemed])).toEqual([
      ["p1", 4, 1],
      ["p2", 0, 0],
    ]);
    expect(result.nextCursor).toBe("p2");
    expect(result.total).toBe(3);
  });

  it("searches only the artist's own pins by title", async () => {
    const { ctx, db } = setup();
    await listRewards(ctx, artist, { search: " poster " });
    expect(db.pin.count).toHaveBeenCalledWith({
      where: {
        artistId: "a1",
        isHidden: false,
        unlockLockedContentId: null,
        title: { contains: "poster", mode: "insensitive" },
      },
    });
  });
});

describe("redeemHistory", () => {
  it("lists only redeemed claims of the artist's pins and pages them", async () => {
    const { ctx, db } = setup();
    db.pinClaim.count.mockResolvedValue(3);
    db.pinClaim.findMany.mockResolvedValue([
      claim({ id: "c1" }),
      claim({ id: "c2" }),
      claim({ id: "c3" }),
    ]);
    const result = await redeemHistory(ctx, artist, { limit: 2 });
    expect(result.items.map((item) => item.id)).toEqual(["c1", "c2"]);
    expect(result.nextCursor).toBe("c2");
    expect(db.pinClaim.count).toHaveBeenCalledWith({
      where: {
        isRedeemed: true,
        isHidden: false,
        spot: { pin: { artistId: "a1", isHidden: false } },
      },
    });
  });
});

describe("NFT content codes on the Redeem page", () => {
  const content = (
    over: { redeemedAt?: Date | null; visited?: number[]; rule?: boolean } = {},
  ) => ({
    code: "XYZ789",
    redeemedAt: over.redeemedAt ?? null,
    createdAt: new Date("2026-11-01"),
    edition: {
      id: "e1",
      tokenId: "40",
      owner: { id: "fan", username: "ana", displayName: "Ana", avatarUrl: null, email: null },
      unlockPins: [
        {
          unlockLockedContentId: "lc1",
          spots: (over.visited ?? [1, 1]).map((claims) => ({ _count: { claims } })),
        },
      ],
    },
    lockedContent: {
      id: "lc1",
      label: "Backstage",
      type: "OTHER",
      unlockRule: over.rule === false ? null : { id: "r1" },
      item: { title: "VIP pass", coverUrl: null, artistId: "a1" },
    },
  });

  it("finds the artist's own content codes, with the owner and the piece", async () => {
    const { ctx, db } = setup(null, 1, content());
    const result = await lookupCode(ctx, artist, "xyz789");
    expect(result).toMatchObject({
      status: "pending",
      claim: { code: "XYZ789", fan: { name: "Ana" }, pin: { title: "Backstage · VIP pass #40" } },
    });
    expect(db.lockedContentRedeem.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { code: "XYZ789", lockedContent: { item: { artistId: "a1" } } },
      }),
    );
  });

  it("won't redeem a piece that isn't unlocked yet", async () => {
    const { ctx, db } = setup(null, 1, content({ visited: [1, 0] }));
    await expect(redeemCode(ctx, artist, "XYZ789")).resolves.toMatchObject({ status: "locked" });
    expect(db.lockedContentRedeem.updateMany).not.toHaveBeenCalled();
  });

  it("redeems an unlocked piece once, by the artist's user", async () => {
    const { ctx, db } = setup(null, 1, content());
    await expect(
      redeemCode(ctx, { ...artist, userId: "artist-user" }, "XYZ789"),
    ).resolves.toMatchObject({ status: "success" });
    expect(db.lockedContentRedeem.updateMany).toHaveBeenCalledWith({
      where: { code: "XYZ789", redeemedAt: null },
      data: { redeemedAt: expect.any(Date) as Date, redeemedById: "artist-user" },
    });
    const twice = setup(null, 1, content({ redeemedAt: new Date() }));
    await expect(redeemCode(twice.ctx, artist, "XYZ789")).resolves.toMatchObject({
      status: "already_redeemed",
    });
  });
});
