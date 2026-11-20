import { describe, expect, it, vi } from "vitest";

import type { Db } from "@actiontokens/db";

import { createContext, type SessionUser } from "../context";
import { portalRouter } from "../root-portal";
import type { ChainGateway } from "../services/chain-gateway";
import { createCallerFactory } from "../trpc";

const createPin = vi.hoisted(() => vi.fn());
vi.mock("../services/artist/pins", async (original) => ({
  ...(await original<typeof import("../services/artist/pins")>()),
  createPin,
}));

const pinInput = {
  title: "Free coffee",
  description: "",
  type: "OTHER" as const,
  visibility: "PUBLIC" as const,
  reward: { kind: "NONE" as const },
  claimLimit: 0,
  startsAt: new Date("2026-11-14T10:00:00Z"),
  endsAt: new Date("2026-11-20T10:00:00Z"),
  autoCollect: false,
  isMultiSpot: false,
  tags: [],
  latitude: 23.8,
  longitude: 90.4,
  radiusMeters: 50,
  spotCount: 1,
};

type ArtistRow = { id: string; userId: string; status: string };
const ownArtist: ArtistRow = { id: "a1", userId: "u1", status: "APPROVED" };
const otherArtist: ArtistRow = { id: "a2", userId: "u2", status: "APPROVED" };

function setup(opts: {
  role: SessionUser["role"];
  header?: string;
  own?: ArtistRow | null;
  artists?: ArtistRow[];
}) {
  const artists = [otherArtist, ...(opts.artists ?? [])];
  const db = {
    artist: {
      findUnique: vi.fn(({ where }: { where: { id?: string; userId?: string } }) => {
        if (where.userId) return Promise.resolve(where.userId === "u1" ? (opts.own ?? null) : null);
        return Promise.resolve(artists.find((artist) => artist.id === where.id) ?? null);
      }),
    },
    pinLayer: { findMany: vi.fn().mockResolvedValue([]) },
    pinTemplate: { findMany: vi.fn().mockResolvedValue([]) },
    user: { findUnique: vi.fn().mockResolvedValue({ suspendedAt: null }) },
    activityLog: { create: vi.fn().mockResolvedValue({}) },
  };
  const caller = createCallerFactory(portalRouter)(
    createContext({
      db: db as unknown as Db,
      chain: {} as ChainGateway,
      app: "org",
      session: {
        user: { id: "u1", role: opts.role, walletAddress: "GX", walletType: "freighter" },
      },
      headers: new Headers(opts.header ? { "x-acting-artist": opts.header } : {}),
    }),
  );
  return { caller, db };
}

describe("an admin acting as an artist", () => {
  it("works on the artist's pin, hotspot, layer, shape and assistant APIs", async () => {
    const { caller, db } = setup({ role: "ADMIN", header: "a2" });
    await caller.layers.list();
    expect(db.pinLayer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { artistId: "a2" } }),
    );
  });

  it("makes pins that go live at once, and logs the admin as the actor", async () => {
    createPin.mockResolvedValue({ pinId: "p1" });
    const acting = setup({ role: "ADMIN", header: "a2", own: ownArtist });
    await acting.caller.pins.createPin(pinInput);
    expect(createPin).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "a2" }),
      expect.anything(),
      expect.any(Date),
      undefined,
      { live: true },
    );
    expect(acting.db.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ actorId: "u1" }) }),
    );
  });

  it("is just themselves when the header names their own artist, or there is none", async () => {
    createPin.mockResolvedValue({ pinId: "p1" });
    for (const header of [undefined, "a1"]) {
      const { caller } = setup({ role: "ADMIN", header, own: ownArtist });
      await caller.pins.createPin(pinInput);
      expect(createPin).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({ id: "a1" }),
        expect.anything(),
        expect.any(Date),
        undefined,
        { live: false },
      );
    }
  });
});

describe("who may act as an artist", () => {
  it("refuses anyone who isn't an admin, even an artist", async () => {
    const { caller, db } = setup({ role: "ARTIST", header: "a2", own: ownArtist });
    await expect(caller.layers.list()).rejects.toThrow(/admins only/);
    expect(db.pinLayer.findMany).not.toHaveBeenCalled();
  });

  it("refuses an artist who doesn't exist or isn't approved", async () => {
    await expect(setup({ role: "ADMIN", header: "nope" }).caller.layers.list()).rejects.toThrow(
      /Artist not found/,
    );
    const pending = setup({
      role: "ADMIN",
      header: "a3",
      artists: [{ id: "a3", userId: "u3", status: "PENDING" }],
    });
    await expect(pending.caller.layers.list()).rejects.toThrow(/Artist not found/);
  });

  it("an artist without the header is still just their own artist", async () => {
    const { caller, db } = setup({ role: "ARTIST", own: ownArtist });
    await caller.layers.list();
    expect(db.pinLayer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { artistId: "a1" } }),
    );
  });
});

describe("the header is ignored everywhere else", () => {
  it("templates stay the admin's own, even while acting", async () => {
    const { caller, db } = setup({ role: "ADMIN", header: "a2", own: ownArtist });
    await caller.templates.list();
    expect(db.pinTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { artistId: "a1" } }),
    );
  });
});
