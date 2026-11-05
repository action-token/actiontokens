import { describe, expect, it, vi } from "vitest";

import { offsetBy } from "@bandcoin/ar-core/ar/geo";
import type { Db } from "@bandcoin/db";

import { createContext, type SessionUser } from "../context";
import { arRouter } from "../root-ar";
import type { ChainGateway } from "../services/chain-gateway";
import { lockReasonFor, type PinRow, searchScore, spotsOf } from "../services/ar/pins";
import { createCallerFactory } from "../trpc";

const me: SessionUser = { id: "me", role: "FAN", walletAddress: "GME", walletType: "freighter" };
const FAN_TOKEN = { code: "LUNA", issuer: "GISSUER" };
const here = { lat: 40.7128, lng: -74.006 };

function caller(db: object, user: SessionUser | null = me, chain: Partial<ChainGateway> = {}) {
  const full = { ...db, activityLog: { create: vi.fn().mockResolvedValue({}) } } as unknown as Db;
  const gateway = {
    loadAccount: vi.fn().mockResolvedValue(null),
    ...chain,
  } as unknown as ChainGateway;
  return createCallerFactory(arRouter)(
    createContext({ db: full, chain: gateway, app: "ar", session: user ? { user } : null }),
  );
}

const holding = (balance: string) =>
  ({
    balances: [
      {
        asset_type: "credit_alphanum4",
        asset_code: FAN_TOKEN.code,
        asset_issuer: FAN_TOKEN.issuer,
        balance,
      },
    ],
  }) as never;

function pinRow(over: Partial<PinRow> = {}): PinRow {
  return {
    id: "pin1",
    artistId: "artist1",
    type: "LAUNCH",
    title: "Album launch",
    description: "Walk here",
    imageUrl: null,
    link: null,
    visibility: "PUBLIC",
    tierId: null,
    tier: null,
    rewardItemId: null,
    rewardsFanToken: true,
    claimLimit: 0,
    claimsLeft: 0,
    startsAt: new Date("2026-01-01"),
    endsAt: new Date("2099-01-01"),
    latitude: here.lat,
    longitude: here.lng,
    radiusMeters: 50,
    isMultiSpot: false,
    isHidden: false,
    approval: "APPROVED",
    restrictedToUserId: null,
    artist: {
      id: "artist1",
      name: "Luna Vale",
      avatarUrl: "https://cdn/luna.png",
      tiers: [{ requiredTokens: 10 }, { requiredTokens: 50 }] as never,
      fanTokenItem: { classicToken: FAN_TOKEN },
    },
    tags: [{ tag: { label: "vinyl" } }, { tag: { label: "launch" } }, { tag: { label: "vinyl" } }],
    spots: [
      {
        id: "s1",
        pinId: "pin1",
        latitude: here.lat,
        longitude: here.lng,
        isHidden: false,
        autoCollect: false,
        claims: [],
      },
      {
        id: "s2",
        pinId: "pin1",
        latitude: here.lat,
        longitude: here.lng + 0.001,
        isHidden: false,
        autoCollect: true,
        claims: [],
      },
    ],
    ...over,
  } as PinRow;
}

const viewer = (over: { follows?: string[]; balance?: string } = {}) => ({
  id: "me",
  followedArtistIds: new Set(over.follows ?? []),
  account: over.balance ? holding(over.balance) : null,
});

describe("pin locks", () => {
  it("opens public pins to everyone", () => {
    expect(lockReasonFor(pinRow(), null)).toBeNull();
  });

  it("asks for a follow on follower pins", () => {
    const pin = pinRow({ visibility: "FOLLOWERS" });
    expect(lockReasonFor(pin, null)).toBe("Sign in and follow Luna Vale to unlock");
    expect(lockReasonFor(pin, viewer())).toBe("Follow Luna Vale to unlock");
    expect(lockReasonFor(pin, viewer({ follows: ["artist1"] }))).toBeNull();
  });

  it("asks a subscribers pin for the fan token's trustline, even with nothing held", () => {
    const pin = pinRow({ visibility: "SUBSCRIBERS" as never });
    expect(lockReasonFor(pin, null)).toBe("Sign in and subscribe to Luna Vale to unlock");
    expect(lockReasonFor(pin, viewer())).toBe("Subscribe to Luna Vale to unlock");
    expect(lockReasonFor(pin, viewer({ balance: "0" }))).toBeNull();
    const noToken = pinRow({
      visibility: "SUBSCRIBERS" as never,
      artist: { ...pinRow().artist, fanTokenItem: null },
    });
    expect(lockReasonFor(noToken, viewer({ balance: "5" }))).toBe("Not available");
  });

  it("checks the fan token against the tier, or the lowest tier for members", () => {
    const tier = pinRow({ visibility: "TIER", tier: { requiredTokens: 50 } as never });
    expect(lockReasonFor(tier, viewer({ balance: "49.9" }))).toBe("Hold 50 LUNA to unlock");
    expect(lockReasonFor(tier, viewer({ balance: "50" }))).toBeNull();
    const members = pinRow({ visibility: "MEMBERS" });
    expect(lockReasonFor(members, viewer({ balance: "10" }))).toBeNull();
    expect(lockReasonFor(members, null)).toBe("Sign in holding 10 LUNA to unlock");
  });

  it("says a gated pin isn't available when the artist has no fan token", () => {
    const pin = pinRow({
      visibility: "MEMBERS",
      artist: { ...pinRow().artist, fanTokenItem: null },
    });
    expect(lockReasonFor(pin, viewer({ balance: "999" }))).toBe("Not available");
  });
});

describe("spotsOf", () => {
  it("turns each spot into a pin with rarity, deduped tags and the artist avatar as fallback art", () => {
    const pins = spotsOf(pinRow(), null);
    expect(pins.map((pin) => pin.id)).toEqual(["s1", "s2"]);
    expect(pins[0]).toMatchObject({
      artistName: "Luna Vale",
      imageUrl: "https://cdn/luna.png",
      rarity: "common",
      remaining: null,
      supply: null,
      tags: ["launch", "vinyl"],
      collected: false,
    });
    expect(pins[1]!.autoCollect).toBe(true);
  });

  it("offers Subscribe only on a subscribers pin a signed-in fan can't open yet", () => {
    const pin = pinRow({ visibility: "SUBSCRIBERS" as never });
    expect(spotsOf(pin, viewer())[0]!.subscribe).toEqual({ following: false });
    expect(spotsOf(pin, viewer({ follows: ["artist1"] }))[0]!.subscribe).toEqual({
      following: true,
    });
    expect(spotsOf(pin, viewer({ balance: "0" }))[0]!.subscribe).toBeNull();
    expect(spotsOf(pin, null)[0]!.subscribe).toBeNull();
    const noToken = pinRow({
      visibility: "SUBSCRIBERS" as never,
      artist: { ...pinRow().artist, fanTokenItem: null },
    });
    expect(spotsOf(noToken, viewer())[0]!.subscribe).toBeNull();
    expect(spotsOf(pinRow({ visibility: "FOLLOWERS" }), viewer())[0]!.subscribe).toBeNull();
  });

  it("marks every spot collected when one is, unless the pin is multi-spot", () => {
    const claim = {
      userId: "me",
      redeemCode: "ABC234",
      isRedeemed: false,
      claimedAt: new Date("2026-10-01"),
      createdAt: new Date("2026-10-01"),
    };
    const row = pinRow();
    row.spots[0]!.claims = [claim];
    expect(spotsOf(row, viewer()).map((pin) => pin.collected)).toEqual([true, true]);
    expect(spotsOf({ ...row, isMultiSpot: true }, viewer()).map((pin) => pin.collected)).toEqual([
      true,
      false,
    ]);
  });

  it("shows claims left only on capped pins", () => {
    expect(spotsOf(pinRow({ claimLimit: 100, claimsLeft: 7 }), null)[0]).toMatchObject({
      remaining: 7,
      supply: 100,
    });
  });
});

describe("pin.collect", () => {
  const collectDb = (row: PinRow, prior: object | null = null) => {
    const tx = {
      pin: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ claimsLeft: 4 }),
      },
      pinClaim: {
        create: vi
          .fn()
          .mockResolvedValue({ id: "c1", redeemCode: "ABC234", claimedAt: new Date("2026-10-29") }),
      },
    };
    return {
      tx,
      db: {
        pinSpot: { findUnique: vi.fn().mockResolvedValue({ ...row.spots[0], pin: row }) },
        pinClaim: { findFirst: vi.fn().mockResolvedValue(prior) },
        follow: { findMany: vi.fn().mockResolvedValue([]) },
        $transaction: (run: (t: typeof tx) => unknown) => run(tx),
      },
    };
  };

  it("collects when the fan is close, and takes one claim off a capped pin", async () => {
    const { db, tx } = collectDb(pinRow({ claimLimit: 5, claimsLeft: 5 }));
    const at = offsetBy(here, 60, 45);
    const result = await caller(db).pin.collect({ spotId: "s1", ...at });
    expect(result).toMatchObject({ id: "c1", redeemCode: "ABC234", remaining: 4 });
    expect(tx.pin.updateMany).toHaveBeenCalledWith({
      where: { id: "pin1", claimsLeft: { gt: 0 } },
      data: { claimsLeft: { decrement: 1 } },
    });
    expect(tx.pinClaim.create.mock.calls[0]?.[0]).toMatchObject({
      data: { userId: "me", spotId: "s1" },
    });
  });

  it("leaves uncapped pins' count alone", async () => {
    const { db, tx } = collectDb(pinRow());
    const result = await caller(db).pin.collect({ spotId: "s1", ...here });
    expect(result.remaining).toBeNull();
    expect(tx.pin.updateMany).not.toHaveBeenCalled();
  });

  it("refuses a fan who is too far away", async () => {
    const { db } = collectDb(pinRow());
    await expect(
      caller(db).pin.collect({ spotId: "s1", ...offsetBy(here, 400, 0) }),
    ).rejects.toMatchObject({
      message: "You're 400 m away. Get within 75 m to collect this.",
    });
  });

  it("uses the artist's radius for an NFT's unlock place", async () => {
    const unlock = { unlockLockedContentId: "lc1", radiusMeters: 300, restrictedToUserId: "me" };
    const near = collectDb(pinRow(unlock as Partial<PinRow>));
    await expect(
      caller(near.db).pin.collect({ spotId: "s1", ...offsetBy(here, 250, 0) }),
    ).resolves.toMatchObject({ id: "c1" });
    const far = collectDb(pinRow({ ...unlock, radiusMeters: 20 } as Partial<PinRow>));
    await expect(
      caller(far.db).pin.collect({ spotId: "s1", ...offsetBy(here, 100, 0) }),
    ).rejects.toMatchObject({ message: "You're 100 m away. Get within 20 m to collect this." });
  });

  it("refuses a second collect of the same pin", async () => {
    const { db } = collectDb(pinRow(), { id: "old" });
    await expect(caller(db).pin.collectByQr({ spotId: "s1" })).rejects.toMatchObject({
      message: "You've already collected this one.",
    });
    expect(db.pinClaim.findFirst).toHaveBeenCalledWith({
      where: { userId: "me", spot: { pinId: "pin1" } },
      select: { id: true },
    });
  });

  it("refuses the last claim when someone else just took it", async () => {
    const { db, tx } = collectDb(pinRow({ claimLimit: 1, claimsLeft: 1 }));
    tx.pin.updateMany.mockResolvedValue({ count: 0 });
    await expect(caller(db).pin.collectByQr({ spotId: "s1" })).rejects.toMatchObject({
      message: "Every one of these has been collected.",
    });
  });

  it("checks the gate at collect time, using the fan's live balance", async () => {
    const row = pinRow({ visibility: "TIER", tier: { requiredTokens: 50 } as never });
    const { db } = collectDb(row);
    await expect(
      caller(db, me, { loadAccount: vi.fn().mockResolvedValue(holding("5")) }).pin.collectByQr({
        spotId: "s1",
      }),
    ).rejects.toMatchObject({
      message: "Hold 50 LUNA to unlock",
    });
  });

  it("won't collect pins that ended, haven't started, or need sign-in", async () => {
    await expect(
      caller(collectDb(pinRow({ endsAt: new Date("2020-01-01") })).db).pin.collectByQr({
        spotId: "s1",
      }),
    ).rejects.toMatchObject({
      message: "This pin has ended.",
    });
    await expect(
      caller(collectDb(pinRow({ startsAt: new Date("2099-01-01") })).db).pin.collectByQr({
        spotId: "s1",
      }),
    ).rejects.toMatchObject({
      message: "This pin hasn't started yet.",
    });
    await expect(
      caller(collectDb(pinRow()).db, null).pin.collectByQr({ spotId: "s1" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("pin.list and search", () => {
  it("only reads the balance when a gated pin is in view", async () => {
    const loadAccount = vi.fn().mockResolvedValue(null);
    const db = {
      pin: { findMany: vi.fn().mockResolvedValue([pinRow()]) },
      follow: { findMany: vi.fn().mockResolvedValue([]) },
    };
    await caller(db, me, { loadAccount }).pin.list();
    expect(loadAccount).not.toHaveBeenCalled();

    db.pin.findMany.mockResolvedValue([pinRow({ visibility: "MEMBERS" })]);
    await caller(db, me, { loadAccount }).pin.list();
    expect(loadAccount).toHaveBeenCalledWith("GME");
  });

  it("drops spots outside the requested circle", async () => {
    const far = pinRow();
    far.spots[1] = { ...far.spots[1]!, latitude: here.lat + 1 };
    const db = { pin: { findMany: vi.fn().mockResolvedValue([far]) } };
    const pins = await caller(db, null).pin.list({ ...here, radiusKm: 5 });
    expect(pins.map((pin) => pin.id)).toEqual(["s1"]);
  });

  it("ranks title hits above description hits", () => {
    const terms = ["vinyl"];
    const inTitle = searchScore(
      { title: "Vinyl hunt", description: null, artistName: "X" },
      [],
      terms,
      "vinyl",
    );
    const inDescription = searchScore(
      { title: "Drop", description: "find the vinyl", artistName: "X" },
      [],
      terms,
      "vinyl",
    );
    expect(inTitle).toBeGreaterThan(inDescription);
  });
});
