import { describe, expect, it, vi } from "vitest";

import type { Db } from "@bandcoin/db";

import { createContext } from "../context";
import { portalRouter } from "../root-portal";
import { createCallerFactory } from "../trpc";
import type { ChainGateway } from "../services/chain-gateway";
import { createFanToken, getFanToken } from "../services/artist/fan-token";
import { createTier, listTiers, removeTier, updateTier } from "../services/artist/tiers";

vi.mock("@bandcoin/storage", () => ({ isOwnS3Url: (url: string) => url.startsWith("https://cdn.example/") }));

type Row = Record<string, unknown>;

const artist = { id: "a1", slug: "luna-vale", name: "Luna Vale", userId: "u1", issuerAccountId: "chain1", fanTokenItemId: null as string | null };
const user = { id: "u1" };
const cover = "https://cdn.example/fan.png";

function setup(opts: { takenCodes?: string[]; assetExists?: boolean; tiers?: Row[]; tier?: Row | null; usage?: [number, number, number] } = {}) {
  const taken = new Set(opts.takenCodes ?? []);
  const created: Row[] = [];
  const db = {
    chainAccount: { findUnique: vi.fn().mockResolvedValue({ id: "chain1", publicKey: "GISSUER", activatedAt: new Date() }) },
    classicToken: { findUnique: vi.fn(({ where }: { where: { code_issuer: { code: string } } }) => Promise.resolve(taken.has(where.code_issuer.code) ? { itemId: "x" } : null)) },
    item: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(({ data }: { data: Row }) => {
        created.push(data);
        return Promise.resolve({ id: "ft1", slug: data.slug });
      }),
      count: vi.fn().mockResolvedValue(opts.usage?.[0] ?? 0),
    },
    artist: { update: vi.fn().mockResolvedValue({}) },
    membershipTier: {
      findMany: vi.fn().mockResolvedValue(opts.tiers ?? []),
      findFirst: vi.fn().mockResolvedValue(opts.tier === undefined ? { id: "t1", artistId: "a1" } : opts.tier),
      create: vi.fn(({ data }: { data: Row }) => Promise.resolve({ id: "t1", ...data })),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
    post: { count: vi.fn().mockResolvedValue(opts.usage?.[1] ?? 0) },
    pin: { count: vi.fn().mockResolvedValue(opts.usage?.[2] ?? 0) },
    $transaction: (run: (tx: unknown) => unknown) => run(db),
  };
  const chain = { assetExists: vi.fn().mockResolvedValue(opts.assetExists ?? true) };
  const activity = { set: vi.fn(), facts: () => ({}) };
  return { ctx: { db: db as unknown as Db, chain: chain as unknown as ChainGateway, activity }, db, chain, created };
}

describe("createFanToken", () => {
  it("generates a code from the artist's name and issues it under their own account", async () => {
    const { ctx, db, created } = setup();
    await expect(createFanToken(ctx, artist, user, { mode: "GENERATE", coverUrl: cover })).resolves.toEqual({ itemId: "ft1", code: "LUNAVALE" });
    expect(created[0]).toMatchObject({
      type: "FAN_TOKEN",
      chainType: "CLASSIC_TOKEN",
      title: "Luna Vale fan token",
      visibility: "PUBLIC",
      artistId: "a1",
      classicToken: { create: { code: "LUNAVALE", issuer: "GISSUER", issuerAccountId: "chain1", isExternal: false } },
    });
    expect(db.artist.update).toHaveBeenCalledWith({ where: { id: "a1" }, data: { fanTokenItemId: "ft1" } });
  });

  it("adds a number when the generated code is taken", async () => {
    const { ctx, created } = setup({ takenCodes: ["LUNAVALE", "LUNAVALE2"] });
    await expect(createFanToken(ctx, artist, user, { mode: "GENERATE", coverUrl: cover })).resolves.toMatchObject({ code: "LUNAVALE3" });
    expect((created[0]!.classicToken as { create: { code: string } }).create.code).toBe("LUNAVALE3");
  });

  it("uses the artist's own code, refusing reserved, malformed or used ones", async () => {
    const { ctx } = setup();
    await expect(createFanToken(ctx, artist, user, { mode: "CUSTOM", code: "luna", coverUrl: cover })).resolves.toMatchObject({ code: "LUNA" });
    await expect(createFanToken(setup().ctx, artist, user, { mode: "CUSTOM", code: "BANDCOIN", coverUrl: cover })).rejects.toMatchObject({ message: "That code is reserved" });
    await expect(createFanToken(setup().ctx, artist, user, { mode: "CUSTOM", code: "no way", coverUrl: cover })).rejects.toMatchObject({ message: "Use only letters and numbers" });
    await expect(createFanToken(setup({ takenCodes: ["LUNA"] }).ctx, artist, user, { mode: "CUSTOM", code: "LUNA", coverUrl: cover })).rejects.toMatchObject({
      message: "You already use that code for another item.",
    });
  });

  it("can point at a Stellar asset the artist already issued, after checking it exists", async () => {
    const issuer = "GCIRB3GJI5PKOW7BUFERNGVB5DMMQT3RCD2I4Z7W4R4F4ED7QTL2K7HU";
    const { ctx, chain, created } = setup();
    await createFanToken(ctx, artist, user, { mode: "EXISTING", code: "LUNA", issuer, coverUrl: cover });
    expect(chain.assetExists).toHaveBeenCalledWith("LUNA", issuer);
    expect(created[0]).toMatchObject({ classicToken: { create: { code: "LUNA", issuer, isExternal: true } } });
    expect((created[0]!.classicToken as { create: Row }).create.issuerAccountId).toBeUndefined();

    await expect(createFanToken(setup({ assetExists: false }).ctx, artist, user, { mode: "EXISTING", code: "LUNA", issuer, coverUrl: cover })).rejects.toMatchObject({
      message: "We couldn't find that asset on Stellar. Check the code and the issuer.",
    });
    await expect(createFanToken(setup().ctx, artist, user, { mode: "EXISTING", code: "LUNA", issuer: "not-a-key", coverUrl: cover })).rejects.toMatchObject({
      message: "Enter the issuer's public key (it starts with G).",
    });
  });

  it("is one per artist, and needs an image from our storage", async () => {
    await expect(createFanToken(setup().ctx, { ...artist, fanTokenItemId: "ft0" }, user, { mode: "GENERATE", coverUrl: cover })).rejects.toMatchObject({ message: "You already have a fan token." });
    await expect(createFanToken(setup().ctx, artist, user, { mode: "GENERATE", coverUrl: "https://evil.example/f.png" })).rejects.toMatchObject({ message: "Upload the cover again." });
  });

  it("needs the artist account open first (unless the token already exists elsewhere)", async () => {
    const { ctx, db } = setup();
    db.chainAccount.findUnique.mockResolvedValue({ id: "chain1", publicKey: "G", activatedAt: null });
    await expect(createFanToken(ctx, artist, user, { mode: "GENERATE", coverUrl: cover })).rejects.toMatchObject({ message: "Open your artist account first." });
  });
});

describe("getFanToken", () => {
  it("is null before one exists, and shows the token once it does", async () => {
    const none = setup();
    await expect(getFanToken(none.ctx, artist)).resolves.toBeNull();
    const { ctx, db } = setup();
    db.item.findFirst.mockResolvedValue({ id: "ft1", coverUrl: cover, classicToken: { code: "LUNA", issuer: "GISSUER", isExternal: false } });
    await expect(getFanToken(ctx, { ...artist, fanTokenItemId: "ft1" })).resolves.toEqual({ itemId: "ft1", code: "LUNA", issuer: "GISSUER", external: false, coverUrl: cover });
  });
});

describe("tiers", () => {
  const input = { name: "Gold", description: "Early access", features: ["Early drops", "Chat"], requiredTokens: "100", color: "#dbdc2c", isPopular: false };

  it("creates a tier that needs N of the fan token", async () => {
    const { ctx, db } = setup();
    await expect(createTier(ctx, { ...artist, fanTokenItemId: "ft1" }, input)).resolves.toEqual({ tierId: "t1" });
    expect(db.membershipTier.create).toHaveBeenCalledWith({
      data: { artistId: "a1", name: "Gold", description: "Early access", features: ["Early drops", "Chat"], requiredTokens: "100", color: "#dbdc2c", isPopular: false },
      select: { id: true },
    });
  });

  it("needs a fan token first, a positive amount and a name", async () => {
    await expect(createTier(setup().ctx, artist, input)).rejects.toMatchObject({ message: "Create your fan token first." });
    await expect(createTier(setup().ctx, { ...artist, fanTokenItemId: "ft1" }, { ...input, requiredTokens: "0" })).rejects.toMatchObject({ message: "Enter a price above zero" });
    await expect(createTier(setup().ctx, { ...artist, fanTokenItemId: "ft1" }, { ...input, name: " " })).rejects.toMatchObject({ message: "Name the tier." });
  });

  it("drops empty feature lines and caps them at 10", async () => {
    const { ctx, db } = setup();
    await createTier(ctx, { ...artist, fanTokenItemId: "ft1" }, { ...input, features: [" Early drops ", "", "  "] });
    expect(db.membershipTier.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ features: ["Early drops"] }) as unknown }));
    await expect(createTier(setup().ctx, { ...artist, fanTokenItemId: "ft1" }, { ...input, features: Array.from({ length: 11 }, (_, i) => `f${i}`) })).rejects.toMatchObject({
      message: "Use at most 10 perks.",
    });
  });

  it("lists tiers from the smallest hold to the biggest", async () => {
    const { ctx, db } = setup();
    db.membershipTier.findMany.mockResolvedValue([
      { id: "t1", name: "Silver", description: "d", features: [], color: null, isPopular: false, isActive: true, requiredTokens: { toString: () => "10" }, _count: { items: 2, posts: 1, pins: 0 } },
    ]);
    await expect(listTiers(ctx, artist)).resolves.toEqual([expect.objectContaining({ id: "t1", name: "Silver", requiredTokens: "10", inUse: 3, isActive: true })]);
    expect(db.membershipTier.findMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: [{ requiredTokens: "asc" }, { createdAt: "asc" }] }));
  });

  it("updates, hides (deactivates) and renames only the artist's own tier", async () => {
    const { ctx, db } = setup();
    await updateTier(ctx, artist, { tierId: "t1", name: "Gold+", isActive: false, requiredTokens: "150" });
    expect(db.membershipTier.update).toHaveBeenCalledWith({ where: { id: "t1" }, data: { name: "Gold+", isActive: false, requiredTokens: "150" } });
    await expect(updateTier(setup({ tier: null }).ctx, artist, { tierId: "t1", name: "x" })).rejects.toMatchObject({ message: "Tier not found" });
  });

  it("deletes a tier nothing uses, and keeps one that gates items, posts or pins", async () => {
    const free = setup();
    await removeTier(free.ctx, artist, "t1");
    expect(free.db.membershipTier.delete).toHaveBeenCalledWith({ where: { id: "t1" } });
    const used = setup({ usage: [1, 2, 0] });
    await expect(removeTier(used.ctx, artist, "t1")).rejects.toMatchObject({ message: "3 items, posts or pins use this tier. Hide it instead." });
    expect(used.db.membershipTier.delete).not.toHaveBeenCalled();
  });
});

describe("memberships router", () => {
  const caller = (artistRow: Row | null, signedIn = true) =>
    createCallerFactory(portalRouter)(
      createContext({
        db: { activityLog: { create: vi.fn() }, artist: { findUnique: vi.fn().mockResolvedValue(artistRow) } } as unknown as Db,
        chain: {} as ChainGateway,
        app: "artist",
        session: signedIn ? { user: { id: "u9", role: "FAN", walletAddress: "GW", walletType: "freighter" } } : null,
      }),
    );

  it("is for signed-in, approved artists only", async () => {
    await expect(caller(null, false).memberships.tiers()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller(null).memberships.fanToken()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller({ id: "a1", status: "PENDING" }).memberships.tiers()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses an unknown way to make a fan token", async () => {
    await expect(caller({ id: "a1", status: "APPROVED" }).memberships.createFanToken({ mode: "MAGIC", coverUrl: "https://cdn.example/f.png" } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
