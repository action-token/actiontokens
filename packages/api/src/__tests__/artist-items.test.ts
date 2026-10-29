import { describe, expect, it, vi } from "vitest";

import type { Db } from "@bandcoin/db";

import { createContext, type SessionUser } from "../context";
import { portalRouter } from "../root-portal";
import type { ChainGateway } from "../services/chain-gateway";
import { createCallerFactory } from "../trpc";
import { createItem, getItem, listMyItems, removeItem, updateItem } from "../services/artist/items";

vi.mock("@bandcoin/storage", () => ({
  isOwnS3Url: (url: string) => url.startsWith("https://cdn.example/"),
}));

type Row = Record<string, unknown>;

const artist = { id: "a1", slug: "luna-vale", userId: "u1", issuerAccountId: "chain1" };
const user = { id: "u1" };
const input = {
  type: "IMAGE" as const,
  title: "Night Drive",
  description: "A print",
  coverUrl: "https://cdn.example/cover.jpg",
  media: { url: "https://cdn.example/art.png", mediaType: "IMAGE" as const },
  code: "nightdrv",
  supply: 100,
  priceBandcoin: "25",
  priceUsd: "0.5",
  visibility: "PUBLIC" as const,
};

function setup(opts: { issuer?: Row | null; takenCode?: boolean; takenSlug?: string; item?: Row | null } = {}) {
  const created: Row[] = [];
  const db = {
    chainAccount: {
      findUnique: vi.fn().mockResolvedValue(opts.issuer === undefined ? { id: "chain1", publicKey: "GISSUER", activatedAt: new Date() } : opts.issuer),
    },
    classicToken: { findUnique: vi.fn().mockResolvedValue(opts.takenCode ? { itemId: "other" } : null), update: vi.fn().mockResolvedValue({}) },
    item: {
      findUnique: vi.fn(({ where }: { where: { slug: string } }) => Promise.resolve(where.slug === opts.takenSlug ? { id: "x" } : null)),
      findFirst: vi.fn().mockResolvedValue(opts.item === undefined ? null : opts.item),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(({ data }: { data: Row }) => {
        created.push(data);
        return Promise.resolve({ id: "i1", slug: data.slug });
      }),
      update: vi.fn().mockResolvedValue({}),
    },
    listing: { update: vi.fn().mockResolvedValue({}) },
    $transaction: (run: (tx: unknown) => unknown) => run(db),
  };
  const activity = { set: vi.fn(), facts: () => ({}) };
  return { ctx: { db: db as unknown as Db, activity }, db, created, activity };
}

describe("createItem", () => {
  it("creates a classic collectible issued by the artist's own account, with its first listing", async () => {
    const { ctx, created, activity } = setup();
    await expect(createItem(ctx, artist, user, input)).resolves.toEqual({ itemId: "i1", slug: "luna-vale-night-drive" });
    expect(created[0]).toMatchObject({
      type: "IMAGE",
      chainType: "CLASSIC_TOKEN",
      title: "Night Drive",
      slug: "luna-vale-night-drive",
      supply: 100,
      artistId: "a1",
      createdById: "u1",
      visibility: "PUBLIC",
      classicToken: { create: { code: "NIGHTDRV", issuer: "GISSUER", issuerAccountId: "chain1" } },
      media: { create: { mediaType: "IMAGE", sourceUrl: "https://cdn.example/art.png" } },
      listings: { create: { sellerId: "u1", kind: "PRIMARY", status: "ACTIVE", priceBandcoin: "25", priceUsd: "0.5" } },
    });
    expect(activity.set).toHaveBeenCalledWith({ targetType: "Item", targetId: "i1" });
  });

  it("keeps a draft off the market: its listing is paused", async () => {
    const { ctx, created } = setup();
    await createItem(ctx, artist, user, { ...input, visibility: "DRAFT" });
    expect(created[0]).toMatchObject({ visibility: "DRAFT", listings: { create: { status: "PAUSED" } } });
  });

  it("makes the page address unique when the title was used before", async () => {
    const { ctx, created } = setup({ takenSlug: "luna-vale-night-drive" });
    await createItem(ctx, artist, user, input);
    expect(created[0]!.slug).toMatch(/^luna-vale-night-drive-[a-z0-9]{4}$/);
  });

  it("needs an open artist account first", async () => {
    await expect(createItem(setup({ issuer: null }).ctx, artist, user, input)).rejects.toMatchObject({ message: "Open your artist account first." });
    await expect(createItem(setup({ issuer: { id: "chain1", publicKey: "G", activatedAt: null } }).ctx, artist, user, input)).rejects.toMatchObject({
      message: "Open your artist account first.",
    });
    await expect(createItem(setup().ctx, { ...artist, issuerAccountId: null }, user, input)).rejects.toMatchObject({ message: "Open your artist account first." });
  });

  it("refuses a code the artist already used, a reserved one, and a bad price", async () => {
    await expect(createItem(setup({ takenCode: true }).ctx, artist, user, input)).rejects.toMatchObject({ message: "You already use that code for another item." });
    await expect(createItem(setup().ctx, artist, user, { ...input, code: "bandcoin" })).rejects.toMatchObject({ message: "That code is reserved" });
    await expect(createItem(setup().ctx, artist, user, { ...input, priceUsd: "0" })).rejects.toMatchObject({ message: "Enter a price above zero" });
  });

  it("takes pictures and files only from our own storage", async () => {
    await expect(createItem(setup().ctx, artist, user, { ...input, coverUrl: "https://evil.example/c.jpg" })).rejects.toMatchObject({ message: "Upload the cover again." });
    await expect(
      createItem(setup().ctx, artist, user, { ...input, media: { url: "https://evil.example/a.png", mediaType: "IMAGE" } }),
    ).rejects.toMatchObject({ message: "Upload the file again." });
  });

  it("needs the file for art, video, 3D and documents, but not for tickets, merch or royalty items", async () => {
    await expect(createItem(setup().ctx, artist, user, { ...input, media: undefined })).rejects.toMatchObject({ message: "Add the file people will get." });
    const { ctx, created } = setup();
    await createItem(ctx, artist, user, { ...input, type: "MERCH", media: undefined });
    expect(created[0]).toMatchObject({ type: "MERCH" });
    expect(created[0]!.media).toBeUndefined();
  });

  it("needs a royalty share for royalty items, between 0 and 100", async () => {
    await expect(createItem(setup().ctx, artist, user, { ...input, type: "ROYALTY", media: undefined })).rejects.toMatchObject({
      message: "Enter the share holders split, above 0 and up to 100%.",
    });
    const { ctx, created } = setup();
    await createItem(ctx, artist, user, { ...input, type: "ROYALTY", media: undefined, royaltyPercent: "10" });
    expect(created[0]).toMatchObject({ royaltyPercent: "10" });
  });
});

const owned = (extra: Row = {}) => ({
  id: "i1",
  artistId: "a1",
  supply: 100,
  visibility: "PUBLIC",
  classicToken: { code: "NIGHTDRV", issuer: "GISSUER" },
  listings: [{ id: "l1", kind: "PRIMARY", status: "ACTIVE", quantitySold: 0 }],
  ...extra,
});

describe("updateItem", () => {
  it("changes text, cover and both prices at any time", async () => {
    const { ctx, db } = setup({ item: owned({ listings: [{ id: "l1", kind: "PRIMARY", status: "ACTIVE", quantitySold: 5 }] }) });
    await updateItem(ctx, artist, { itemId: "i1", title: "Night Drive II", description: "New", coverUrl: "https://cdn.example/c2.jpg", priceBandcoin: "30", priceUsd: "0.6" });
    expect(db.item.update).toHaveBeenCalledWith({
      where: { id: "i1" },
      data: { title: "Night Drive II", description: "New", coverUrl: "https://cdn.example/c2.jpg" },
    });
    expect(db.listing.update).toHaveBeenCalledWith({ where: { id: "l1" }, data: { priceBandcoin: "30", priceUsd: "0.6" } });
  });

  it("changes supply and code only before the first sale", async () => {
    const free = setup({ item: owned() });
    await updateItem(free.ctx, artist, { itemId: "i1", supply: 50, code: "NIGHT2" });
    expect(free.db.item.update).toHaveBeenCalledWith({ where: { id: "i1" }, data: { supply: 50 } });
    expect(free.db.classicToken.update).toHaveBeenCalledWith({ where: { itemId: "i1" }, data: { code: "NIGHT2" } });

    const sold = setup({ item: owned({ listings: [{ id: "l1", kind: "PRIMARY", status: "ACTIVE", quantitySold: 1 }] }) });
    await expect(updateItem(sold.ctx, artist, { itemId: "i1", supply: 50 })).rejects.toMatchObject({
      message: "Supply and code can't change after the first sale.",
    });
    await expect(updateItem(sold.ctx, artist, { itemId: "i1", code: "NIGHT2" })).rejects.toMatchObject({
      message: "Supply and code can't change after the first sale.",
    });
  });

  it("publishing opens the listing and hiding pauses it", async () => {
    const hide = setup({ item: owned() });
    await updateItem(hide.ctx, artist, { itemId: "i1", visibility: "DRAFT" });
    expect(hide.db.item.update).toHaveBeenCalledWith({ where: { id: "i1" }, data: { visibility: "DRAFT" } });
    expect(hide.db.listing.update).toHaveBeenCalledWith({ where: { id: "l1" }, data: { status: "PAUSED" } });

    const show = setup({ item: owned({ visibility: "DRAFT", listings: [{ id: "l1", kind: "PRIMARY", status: "PAUSED", quantitySold: 0 }] }) });
    await updateItem(show.ctx, artist, { itemId: "i1", visibility: "PUBLIC" });
    expect(show.db.listing.update).toHaveBeenCalledWith({ where: { id: "l1" }, data: { status: "ACTIVE" } });
  });

  it("never reopens a sold-out listing by publishing", async () => {
    const { ctx, db } = setup({ item: owned({ visibility: "DRAFT", listings: [{ id: "l1", kind: "PRIMARY", status: "SOLD_OUT", quantitySold: 100 }] }) });
    await updateItem(ctx, artist, { itemId: "i1", visibility: "PUBLIC" });
    expect(db.listing.update).not.toHaveBeenCalled();
  });

  it("only touches the artist's own items", async () => {
    await expect(updateItem(setup({ item: null }).ctx, artist, { itemId: "i1", title: "x" })).rejects.toMatchObject({ message: "Item not found" });
  });
});

describe("removeItem", () => {
  it("deletes an item nobody bought, and closes its listing", async () => {
    const { ctx, db } = setup({ item: owned() });
    await removeItem(ctx, artist, "i1");
    expect(db.item.update).toHaveBeenCalledWith({ where: { id: "i1" }, data: { deletedAt: expect.any(Date) as Date } });
    expect(db.listing.update).toHaveBeenCalledWith({ where: { id: "l1" }, data: { status: "CLOSED" } });
  });

  it("keeps an item that has sales: hide it instead", async () => {
    const { ctx, db } = setup({ item: owned({ listings: [{ id: "l1", kind: "PRIMARY", status: "ACTIVE", quantitySold: 3 }] }) });
    await expect(removeItem(ctx, artist, "i1")).rejects.toMatchObject({ message: "This item has sales, so it can't be deleted. Hide it instead." });
    expect(db.item.update).not.toHaveBeenCalled();
  });
});

describe("getItem", () => {
  it("returns everything the edit form needs, and whether supply and code are still open", async () => {
    const row = {
      id: "i1", title: "Night Drive", description: "A print", coverUrl: "c", type: "IMAGE", supply: 100, visibility: "PUBLIC", royaltyPercent: null,
      classicToken: { code: "NIGHTDRV" },
      media: { mediaType: "IMAGE", sourceUrl: "https://cdn.example/art.png" },
      listings: [{ id: "l1", priceBandcoin: { toString: () => "25" }, priceUsd: { toString: () => "0.5" }, status: "ACTIVE", quantitySold: 0 }],
    };
    const free = setup({ item: row });
    await expect(getItem(free.ctx, artist, "i1")).resolves.toMatchObject({
      id: "i1", title: "Night Drive", description: "A print", code: "NIGHTDRV", supply: 100, sold: 0, locked: false, priceBandcoin: "25", priceUsd: "0.5", fileUrl: "https://cdn.example/art.png",
    });
    const sold = setup({ item: { ...row, listings: [{ ...row.listings[0]!, quantitySold: 2 }] } });
    await expect(getItem(sold.ctx, artist, "i1")).resolves.toMatchObject({ sold: 2, locked: true });
  });

  it("only shows the artist's own item", async () => {
    await expect(getItem(setup({ item: null }).ctx, artist, "i1")).rejects.toMatchObject({ message: "Item not found" });
  });
});

describe("listMyItems", () => {
  it("lists the artist's items without the deleted ones, newest first", async () => {
    const { ctx, db } = setup();
    db.item.findMany.mockResolvedValue([
      {
        id: "i1", slug: "s", title: "Night Drive", type: "IMAGE", coverUrl: "c", supply: 100, visibility: "PUBLIC", createdAt: new Date("2026-10-01"),
        classicToken: { code: "NIGHTDRV" },
        listings: [{ id: "l1", priceBandcoin: { toString: () => "25" }, priceUsd: { toString: () => "0.5" }, status: "ACTIVE", quantitySold: 4 }],
      },
    ]);
    await expect(listMyItems(ctx, artist)).resolves.toEqual([
      expect.objectContaining({ id: "i1", title: "Night Drive", code: "NIGHTDRV", sold: 4, supply: 100, priceBandcoin: "25", priceUsd: "0.5", listingStatus: "ACTIVE" }),
    ]);
    expect(db.item.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { artistId: "a1", deletedAt: null, chainType: "CLASSIC_TOKEN" }, orderBy: { createdAt: "desc" } }));
  });
});

describe("catalog router", () => {
  const fan: SessionUser = { id: "u9", role: "FAN", walletAddress: "GW", walletType: "freighter" };
  const caller = (user: SessionUser | null, artistRow: Row | null) =>
    createCallerFactory(portalRouter)(
      createContext({
        db: { activityLog: { create: vi.fn() }, artist: { findUnique: vi.fn().mockResolvedValue(artistRow) } } as unknown as Db,
        chain: {} as ChainGateway,
        app: "artist",
        session: user ? { user } : null,
      }),
    );

  it("is for signed-in, approved artists only", async () => {
    await expect(caller(null, null).catalog.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller(fan, null).catalog.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller(fan, { id: "a1", status: "PENDING" }).catalog.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects an empty title before touching anything", async () => {
    await expect(
      caller(fan, { id: "a1", status: "APPROVED", slug: "s", issuerAccountId: "c" }).catalog.create({ ...input, title: " " }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
