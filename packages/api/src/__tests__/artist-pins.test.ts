import { describe, expect, it, vi } from "vitest";

import type { Db } from "@bandcoin/db";

import { suggestPinTags } from "../services/ai/generate";
import type { AiModel } from "../services/ai/model";
import {
  createPin,
  listPins,
  pinOptions,
  removePin,
  removeSpot,
  setPinHidden,
  tagName,
  updatePin,
  type PinInput,
} from "../services/artist/pins";

vi.mock("@bandcoin/storage", () => ({
  isOwnS3Url: (url: string) => url.startsWith("https://cdn.example/"),
  uploadBufferToS3: vi.fn(),
}));
vi.mock("../services/ai/model", () => ({
  friendlyProviderError: () => "The AI couldn't finish that. Try again.",
}));

type Row = Record<string, unknown>;

const artist = { id: "a1" };
const now = new Date("2026-11-01T12:00:00Z");
const starts = new Date("2026-11-02T10:00:00Z");
const ends = new Date("2026-11-09T10:00:00Z");

const basePin: PinInput = {
  title: " Secret show ",
  description: "Find me by the fountain",
  type: "EXPERIENCE",
  visibility: "PUBLIC",
  reward: { kind: "NONE" },
  claimLimit: 0,
  startsAt: starts,
  endsAt: ends,
  latitude: 23.78,
  longitude: 90.4,
  radiusMeters: 50,
  spotCount: 3,
  autoCollect: false,
  isMultiSpot: false,
};

function setup(
  over: {
    item?: Row | null;
    tier?: Row | null;
    event?: Row | null;
    owner?: Row | null;
    pin?: Row | null;
    claims?: number;
    spot?: Row | null;
    visibleSpots?: number;
  } = {},
) {
  const created: Row[] = [];
  const updated: Row[] = [];
  const db = {
    pin: {
      create: vi.fn(({ data }: { data: Row }) => {
        created.push(data);
        return Promise.resolve({ id: "p1" });
      }),
      findFirst: vi.fn().mockResolvedValue(
        over.pin === undefined
          ? {
              id: "p1",
              startsAt: starts,
              endsAt: ends,
              claimLimit: 0,
              claimsLeft: 0,
              rewardItemId: null,
              rewardsFanToken: false,
              visibility: "PUBLIC",
              tierId: null,
            }
          : over.pin,
      ),
      findMany: vi.fn(),
      update: vi.fn(({ data }: { data: Row }) => {
        updated.push(data);
        return Promise.resolve({});
      }),
      delete: vi.fn().mockResolvedValue({}),
    },
    pinSpot: {
      findFirst: vi
        .fn()
        .mockResolvedValue(
          over.spot === undefined
            ? { id: "s1", pinId: "p1", isHidden: false, _count: { claims: 0 } }
            : over.spot,
        ),
      count: vi.fn().mockResolvedValue(over.visibleSpots ?? 3),
      updateMany: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
    pinClaim: { count: vi.fn().mockResolvedValue(over.claims ?? 0) },
    pinTag: {
      upsert: vi.fn(({ where }: { where: { name: string } }) =>
        Promise.resolve({ id: `tag-${where.name}` }),
      ),
    },
    pinTagLink: {
      deleteMany: vi.fn().mockResolvedValue({}),
      createMany: vi.fn().mockResolvedValue({}),
    },
    pinTagCache: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
    },
    item: {
      findFirst: vi
        .fn()
        .mockResolvedValue(
          over.item === undefined ? { id: "i1", title: "Sticker", supply: null } : over.item,
        ),
    },
    membershipTier: {
      findFirst: vi.fn().mockResolvedValue(over.tier === undefined ? { id: "t1" } : over.tier),
    },
    event: {
      findFirst: vi.fn().mockResolvedValue(over.event === undefined ? { id: "e1" } : over.event),
    },
    artist: {
      findUnique: vi
        .fn()
        .mockResolvedValue(over.owner === undefined ? { fanTokenItemId: "ft1" } : over.owner),
    },
    aiUsage: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn(),
  };
  db.$transaction.mockImplementation((work: (tx: typeof db) => unknown) =>
    Promise.resolve(work(db)),
  );
  const activity = { set: vi.fn(), facts: () => ({}) };
  return { ctx: { db: db as unknown as Db, activity }, db, created, updated, activity };
}

describe("creating a pin", () => {
  it("saves it for review, scatters the spots inside the radius and logs it", async () => {
    const { ctx, created, activity } = setup();
    await expect(createPin(ctx, artist, basePin, now)).resolves.toEqual({ pinId: "p1" });
    const data = created[0] as {
      title: string;
      approval: string;
      claimsLeft: number;
      spots: {
        createMany: { data: { latitude: number; longitude: number; autoCollect: boolean }[] };
      };
    };
    expect(data).toMatchObject({
      artistId: "a1",
      title: "Secret show",
      approval: "PENDING",
      claimLimit: 0,
      claimsLeft: 0,
      radiusMeters: 50,
    });
    const spots = data.spots.createMany.data;
    expect(spots).toHaveLength(3);
    for (const spot of spots) {
      expect(Math.abs(spot.latitude - 23.78)).toBeLessThan(0.001);
      expect(Math.abs(spot.longitude - 90.4)).toBeLessThan(0.001);
    }
    expect(activity.set).toHaveBeenCalledWith({ targetType: "Pin", targetId: "p1" });
  });

  it("puts every spot on the centre when the radius is zero, and copies auto-collect to each", async () => {
    const { ctx, created } = setup();
    await createPin(
      ctx,
      artist,
      { ...basePin, radiusMeters: 0, spotCount: 2, autoCollect: true },
      now,
    );
    const spots = (created[0] as { spots: { createMany: { data: Row[] } } }).spots.createMany.data;
    expect(spots).toEqual([
      { latitude: 23.78, longitude: 90.4, autoCollect: true },
      { latitude: 23.78, longitude: 90.4, autoCollect: true },
    ]);
  });

  it("links tags by shared name, reusing one that exists, and skips duplicates", async () => {
    const { ctx, db } = setup();
    await createPin(
      ctx,
      artist,
      { ...basePin, tags: ["Street Art", "street  art", " Dhaka "] },
      now,
    );
    expect(db.pinTag.upsert).toHaveBeenCalledTimes(2);
    expect(db.pinTag.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { name: "street-art" },
        create: { name: "street-art", label: "street art", artistId: "a1" },
        update: {},
      }),
    );
    expect(db.pinTagLink.createMany).toHaveBeenCalledWith({
      data: [
        { pinId: "p1", tagId: "tag-street-art" },
        { pinId: "p1", tagId: "tag-dhaka" },
      ],
      skipDuplicates: true,
    });
  });

  it.each([
    ["a short title", { title: "ab" }, /title/i],
    ["a cover that isn't ours", { imageUrl: "https://evil.example/x.png" }, /upload the cover/i],
    ["a javascript link", { link: "javascript:alert(1)" }, /web address/i],
    ["a latitude off the globe", { latitude: 95 }, /latitude/i],
    ["a huge radius", { radiusMeters: 20_000 }, /radius/i],
    ["no spots", { spotCount: 0 }, /spots/i],
    ["too many spots", { spotCount: 101 }, /spots/i],
    ["an end before the start", { endsAt: new Date("2026-11-01T00:00:00Z") }, /end after/i],
    [
      "an end in the past",
      { startsAt: new Date("2026-10-01T00:00:00Z"), endsAt: new Date("2026-10-02T00:00:00Z") },
      /past/i,
    ],
  ])("refuses %s", async (_name, patch, message) => {
    const { ctx, db } = setup();
    await expect(createPin(ctx, artist, { ...basePin, ...patch }, now)).rejects.toThrow(message);
    expect(db.pin.create).not.toHaveBeenCalled();
  });

  it("needs a tier of the artist's own for a tier pin", async () => {
    await expect(
      createPin(setup().ctx, artist, { ...basePin, visibility: "TIER" }, now),
    ).rejects.toThrow(/pick the tier/i);
    await expect(
      createPin(
        setup({ tier: null }).ctx,
        artist,
        { ...basePin, visibility: "TIER", tierId: "other" },
        now,
      ),
    ).rejects.toThrow(/tier isn't available/i);
    const { ctx, created } = setup();
    await createPin(ctx, artist, { ...basePin, visibility: "TIER", tierId: "t1" }, now);
    expect(created[0]).toMatchObject({ visibility: "TIER", tierId: "t1" });
  });

  it("ignores a stray tier on a public pin", async () => {
    const { ctx, created } = setup();
    await createPin(ctx, artist, { ...basePin, tierId: "t1" }, now);
    expect(created[0]).toMatchObject({ tierId: null });
  });

  it("needs a collect limit when it gives a reward", async () => {
    await expect(
      createPin(
        setup().ctx,
        artist,
        { ...basePin, reward: { kind: "ITEM", itemId: "i1" }, claimLimit: 0 },
        now,
      ),
    ).rejects.toThrow(/how many fans/i);
  });

  it("rewards one of the artist's own items, up to its supply", async () => {
    const { ctx, created } = setup();
    await createPin(
      ctx,
      artist,
      { ...basePin, reward: { kind: "ITEM", itemId: "i1" }, claimLimit: 20 },
      now,
    );
    expect(created[0]).toMatchObject({
      rewardItemId: "i1",
      rewardsFanToken: false,
      claimLimit: 20,
      claimsLeft: 20,
    });

    await expect(
      createPin(
        setup({ item: { id: "i1", title: "Sticker", supply: 10 } }).ctx,
        artist,
        { ...basePin, reward: { kind: "ITEM", itemId: "i1" }, claimLimit: 11 },
        now,
      ),
    ).rejects.toThrow(/only has 10 copies/i);
    await expect(
      createPin(
        setup({ item: null }).ctx,
        artist,
        { ...basePin, reward: { kind: "ITEM", itemId: "x" }, claimLimit: 5 },
        now,
      ),
    ).rejects.toThrow(/isn't available/i);
  });

  it("only offers the artist's classic items, never a fan token or a royalty share", async () => {
    const { ctx, db } = setup();
    await createPin(
      ctx,
      artist,
      { ...basePin, reward: { kind: "ITEM", itemId: "i1" }, claimLimit: 5 },
      now,
    );
    expect(db.item.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "i1",
          artistId: "a1",
          deletedAt: null,
          chainType: "CLASSIC_TOKEN",
          type: { notIn: ["FAN_TOKEN", "ROYALTY"] },
        },
      }),
    );
  });

  it("rewards the fan token only once it exists", async () => {
    const { ctx, created } = setup();
    await createPin(
      ctx,
      artist,
      { ...basePin, reward: { kind: "FAN_TOKEN" }, claimLimit: 50 },
      now,
    );
    expect(created[0]).toMatchObject({
      rewardItemId: null,
      rewardsFanToken: true,
      rewardAmount: "1.0000000",
      claimLimit: 50,
    });
    await expect(
      createPin(
        setup({ owner: { fanTokenItemId: null } }).ctx,
        artist,
        { ...basePin, reward: { kind: "FAN_TOKEN" }, claimLimit: 5 },
        now,
      ),
    ).rejects.toThrow(/fan token first/i);
  });

  it("gives an amount of the fan token per collect, above zero", async () => {
    const { ctx, created } = setup();
    await createPin(
      ctx,
      artist,
      { ...basePin, reward: { kind: "FAN_TOKEN", amount: "12.5" }, claimLimit: 10 },
      now,
    );
    expect(created[0]).toMatchObject({ rewardsFanToken: true, rewardAmount: "12.5000000" });
    for (const amount of ["0", "-3", "1.12345678", "lots"])
      await expect(
        createPin(
          setup().ctx,
          artist,
          { ...basePin, reward: { kind: "FAN_TOKEN", amount }, claimLimit: 10 },
          now,
        ),
      ).rejects.toThrow(/how many tokens each fan gets/i);
  });

  it("locks the fan-token amount once someone collected", async () => {
    const pin = {
      id: "p1",
      startsAt: starts,
      endsAt: ends,
      claimLimit: 10,
      claimsLeft: 9,
      rewardItemId: null,
      rewardsFanToken: true,
      rewardAmount: "5",
      visibility: "PUBLIC",
      tierId: null,
    };
    await expect(
      updatePin(setup({ claims: 1, pin }).ctx, artist, {
        pinId: "p1",
        reward: { kind: "FAN_TOKEN", amount: "50" },
      }),
    ).rejects.toThrow(/reward can't change/i);
    // The same amount typed differently is no change.
    const same = setup({ claims: 1, pin });
    await updatePin(same.ctx, artist, {
      pinId: "p1",
      reward: { kind: "FAN_TOKEN", amount: "5.00" },
      claimLimit: 20,
    });
    expect(same.updated[0]).toMatchObject({ claimLimit: 20, rewardAmount: "5.0000000" });
  });

  it("links an event of the artist's own", async () => {
    const { ctx, created } = setup();
    await createPin(ctx, artist, { ...basePin, eventId: "e1" }, now);
    expect(created[0]).toMatchObject({ eventId: "e1" });
    await expect(
      createPin(setup({ event: null }).ctx, artist, { ...basePin, eventId: "nope" }, now),
    ).rejects.toThrow(/event isn't available/i);
  });
});

describe("editing a pin", () => {
  it("changes the text and the schedule", async () => {
    const { ctx, updated, db } = setup();
    await updatePin(ctx, artist, {
      pinId: "p1",
      title: " New name ",
      description: "",
      link: "https://x.example/a",
      autoCollect: true,
      tags: ["live"],
    });
    expect(updated[0]).toMatchObject({
      title: "New name",
      description: null,
      link: "https://x.example/a",
    });
    expect(db.pinSpot.updateMany).toHaveBeenCalledWith({
      where: { pinId: "p1" },
      data: { autoCollect: true },
    });
    expect(db.pinTagLink.deleteMany).toHaveBeenCalledWith({ where: { pinId: "p1" } });
  });

  it("keeps a pin it doesn't own out of reach", async () => {
    await expect(
      updatePin(setup({ pin: null }).ctx, artist, { pinId: "p9", title: "Hijack" }),
    ).rejects.toThrow(/not found/i);
  });

  it("won't take the limit below what fans already collected, and re-counts what is left", async () => {
    const { ctx } = setup({
      claims: 8,
      pin: {
        id: "p1",
        startsAt: starts,
        endsAt: ends,
        claimLimit: 10,
        claimsLeft: 2,
        rewardItemId: "i1",
        rewardsFanToken: false,
        visibility: "PUBLIC",
        tierId: null,
      },
    });
    await expect(updatePin(ctx, artist, { pinId: "p1", claimLimit: 5 })).rejects.toThrow(
      /8 fans have already collected/i,
    );

    const ok = setup({
      claims: 8,
      pin: {
        id: "p1",
        startsAt: starts,
        endsAt: ends,
        claimLimit: 10,
        claimsLeft: 2,
        rewardItemId: "i1",
        rewardsFanToken: false,
        visibility: "PUBLIC",
        tierId: null,
      },
    });
    await updatePin(ok.ctx, artist, { pinId: "p1", claimLimit: 25 });
    expect(ok.updated[0]).toMatchObject({ claimLimit: 25, claimsLeft: 17 });
  });

  it("locks the reward once someone collected, but lets an untouched pin change it", async () => {
    const collected = setup({
      claims: 1,
      pin: {
        id: "p1",
        startsAt: starts,
        endsAt: ends,
        claimLimit: 10,
        claimsLeft: 9,
        rewardItemId: "i1",
        rewardsFanToken: false,
        visibility: "PUBLIC",
        tierId: null,
      },
    });
    await expect(
      updatePin(collected.ctx, artist, { pinId: "p1", reward: { kind: "FAN_TOKEN" } }),
    ).rejects.toThrow(/reward can't change/i);

    const fresh = setup({
      claims: 0,
      pin: {
        id: "p1",
        startsAt: starts,
        endsAt: ends,
        claimLimit: 10,
        claimsLeft: 10,
        rewardItemId: "i1",
        rewardsFanToken: false,
        visibility: "PUBLIC",
        tierId: null,
      },
    });
    await updatePin(fresh.ctx, artist, { pinId: "p1", reward: { kind: "FAN_TOKEN" } });
    expect(fresh.updated[0]).toMatchObject({
      rewardsFanToken: true,
      rewardItem: { disconnect: true },
    });
  });

  it("clears the event link", async () => {
    const { ctx, updated } = setup();
    await updatePin(ctx, artist, { pinId: "p1", eventId: null });
    expect(updated[0]).toMatchObject({ event: { disconnect: true } });
  });
});

describe("hiding and deleting", () => {
  it("hides and shows a pin", async () => {
    const { ctx, updated } = setup();
    await expect(setPinHidden(ctx, artist, "p1", true)).resolves.toEqual({
      pinId: "p1",
      hidden: true,
    });
    expect(updated[0]).toEqual({ isHidden: true });
  });

  it("deletes a pin nobody collected, and only hides one somebody did", async () => {
    const free = setup({ claims: 0 });
    await removePin(free.ctx, artist, "p1");
    expect(free.db.pin.delete).toHaveBeenCalledWith({ where: { id: "p1" } });

    const taken = setup({ claims: 3 });
    await expect(removePin(taken.ctx, artist, "p1")).rejects.toThrow(/3 fans have collected/i);
    expect(taken.db.pin.delete).not.toHaveBeenCalled();
  });

  it("removes an empty spot, hides a collected one, and keeps the last", async () => {
    const empty = setup();
    await removeSpot(empty.ctx, artist, "s1");
    expect(empty.db.pinSpot.delete).toHaveBeenCalledWith({ where: { id: "s1" } });

    const used = setup({ spot: { id: "s1", pinId: "p1", isHidden: false, _count: { claims: 2 } } });
    await removeSpot(used.ctx, artist, "s1");
    expect(used.db.pinSpot.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { isHidden: true },
    });

    await expect(removeSpot(setup({ visibleSpots: 1 }).ctx, artist, "s1")).rejects.toThrow(
      /at least one spot/i,
    );
  });
});

describe("the pin list", () => {
  const row = (over: Row) => ({
    id: "p1",
    title: "Pin",
    imageUrl: null,
    type: "OTHER",
    visibility: "PUBLIC",
    isHidden: false,
    startsAt: starts,
    endsAt: ends,
    claimLimit: 0,
    claimsLeft: 0,
    latitude: 1,
    longitude: 2,
    rewardItem: null,
    rewardsFanToken: false,
    event: null,
    tags: [{ tag: { label: "live" } }],
    spots: [
      { id: "s1", latitude: 1, longitude: 2, autoCollect: true, _count: { claims: 2 } },
      { id: "s2", latitude: 1.1, longitude: 2.1, autoCollect: false, _count: { claims: 1 } },
    ],
    ...over,
  });

  it.each([
    ["live", {}, "2026-11-03T00:00:00Z", "LIVE"],
    ["scheduled", {}, "2026-11-01T00:00:00Z", "SCHEDULED"],
    ["ended", {}, "2026-12-01T00:00:00Z", "ENDED"],
    ["hidden", { isHidden: true }, "2026-11-03T00:00:00Z", "HIDDEN"],
    ["all collected", { claimLimit: 5, claimsLeft: 0 }, "2026-11-03T00:00:00Z", "ALL_COLLECTED"],
  ])("calls a %s pin %s", async (_name, over, at, status) => {
    const { ctx, db } = setup();
    db.pin.findMany.mockResolvedValue([row(over)]);
    const [pin] = await listPins(ctx, artist, new Date(at));
    expect(pin).toMatchObject({ status, spots: 2, collected: 3, tags: ["live"], reward: null });
  });

  it("gives the map each spot's place and whether the pin collects itself", async () => {
    const { ctx, db } = setup();
    db.pin.findMany.mockResolvedValue([row({})]);
    const [pin] = await listPins(ctx, artist, now);
    expect(pin?.spotPoints).toEqual([
      { id: "s1", latitude: 1, longitude: 2, autoCollect: true, collected: 2 },
      { id: "s2", latitude: 1.1, longitude: 2.1, autoCollect: false, collected: 1 },
    ]);
    expect(pin?.autoCollect).toBe(true);
  });

  it("names the reward", async () => {
    const { ctx, db } = setup();
    db.pin.findMany.mockResolvedValue([
      row({ rewardItem: { title: "Sticker", coverUrl: "x" } }),
      row({ id: "p2", rewardsFanToken: true, rewardAmount: "1" }),
      row({ id: "p3", rewardsFanToken: true, rewardAmount: "25" }),
    ]);
    const pins = await listPins(ctx, artist, now);
    expect(pins.map((pin) => pin.reward)).toEqual(["Sticker", "1 fan token", "25 fan tokens"]);
  });
});

describe("tag names", () => {
  it("are the same however they are typed", () => {
    expect(tagName("  Street   Art ")).toBe("street-art");
  });
});

describe("AI tag suggestions", () => {
  const actor = { artist: { userId: "u1", name: "Luna", bio: null }, unlimited: false };
  const input = {
    title: "Secret show",
    description: "By the fountain",
    type: "EXPERIENCE",
    place: "Dhaka",
  };
  const model = (tags: string[] | null): AiModel => ({
    fill: vi.fn().mockResolvedValue(tags ? { tags } : null),
    write: vi.fn(),
    image: vi.fn(),
  });

  it("cleans the tags, caches them and counts one generation", async () => {
    const { ctx, db } = setup();
    const result = await suggestPinTags(
      ctx,
      model([" Street Art ", "#dhaka", "dhaka", "", "x".repeat(41), "live music"]),
      actor,
      input,
    );
    expect(result.tags).toEqual(["street art", "dhaka", "live music"]);
    expect(db.pinTagCache.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { title: "secret-show|dhaka" } }),
    );
    expect(db.aiUsage.upsert).toHaveBeenCalledTimes(1);
  });

  it("answers a repeat from the cache without using allowance", async () => {
    const { ctx, db } = setup();
    db.pinTagCache.findUnique.mockResolvedValue({ tags: ["cached"] });
    const fake = model(["new"]);
    await expect(suggestPinTags(ctx, fake, actor, input)).resolves.toEqual({ tags: ["cached"] });
    expect(fake.fill).not.toHaveBeenCalled();
    expect(db.aiUsage.upsert).not.toHaveBeenCalled();
  });

  it("says so when nothing usable came back, and doesn't charge", async () => {
    const { ctx, db } = setup();
    await expect(suggestPinTags(ctx, model(null), actor, input)).rejects.toThrow(/didn't suggest/i);
    expect(db.aiUsage.upsert).not.toHaveBeenCalled();
    expect(db.pinTagCache.upsert).not.toHaveBeenCalled();
  });
});

describe("pin options", () => {
  function optionsCtx(storage: { activatedAt: Date | null } | null, balance?: string) {
    const db = {
      item: { findMany: vi.fn().mockResolvedValue([]) },
      membershipTier: { findMany: vi.fn().mockResolvedValue([]) },
      event: { findMany: vi.fn().mockResolvedValue([]) },
      pinTag: { findMany: vi.fn().mockResolvedValue([]) },
      artist: {
        findUnique: vi.fn().mockResolvedValue({
          fanTokenItem: {
            title: "Luna",
            coverUrl: null,
            classicToken: { code: "LUNA", issuer: "GISSUER" },
          },
        }),
      },
      chainAccount: {
        findUnique: vi
          .fn()
          .mockResolvedValue(
            storage && { publicKey: "GSTORAGE", activatedAt: storage.activatedAt },
          ),
      },
    };
    const chain = {
      loadAccount: vi.fn().mockResolvedValue({
        balances: [
          { asset_type: "native", balance: "5" },
          ...(balance === undefined
            ? []
            : [
                {
                  asset_type: "credit_alphanum4",
                  asset_code: "LUNA",
                  asset_issuer: "GISSUER",
                  balance,
                  selling_liabilities: "0",
                },
              ]),
        ],
      }),
    };
    return { db: db as unknown as Db, chain: chain as never };
  }

  it("says how many fan tokens storage holds for rewards", async () => {
    const opened = await pinOptions(optionsCtx({ activatedAt: new Date() }, "1500"), {
      id: "a1",
      storageAccountId: "s1",
    });
    expect(opened.fanToken).toMatchObject({ code: "LUNA", inStorage: "1500.0000000" });

    const empty = await pinOptions(optionsCtx({ activatedAt: new Date() }), {
      id: "a1",
      storageAccountId: "s1",
    });
    expect(empty.fanToken?.inStorage).toBe("0.0000000");

    const closed = await pinOptions(optionsCtx(null), { id: "a1", storageAccountId: null });
    expect(closed.fanToken?.inStorage).toBeNull();
  });
});
