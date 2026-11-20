import { describe, expect, it, vi } from "vitest";

import type { Db } from "@actiontokens/db";

import { createContext, type SessionUser } from "../context";
import { appRouter } from "../root-app";
import { portalRouter } from "../root-portal";
import type { ChainGateway } from "../services/chain-gateway";
import { createCallerFactory } from "../trpc";

const fan: SessionUser = { id: "f1", role: "FAN", walletAddress: "GF", walletType: "freighter" };
const make = (db: object, app: "app" | "org", user: SessionUser | null) =>
  createContext({
    db: { ...db, activityLog: { create: vi.fn().mockResolvedValue({}) } } as unknown as Db,
    chain: {} as ChainGateway,
    app,
    session: user ? { user } : null,
  });

describe("gallery (fan app)", () => {
  it("shows the entrance to everyone", async () => {
    const db = { organization: { findMany: vi.fn().mockResolvedValue([{ id: "o1" }]) } };
    const result = await createCallerFactory(appRouter)(make(db, "app", null)).gallery.list();
    expect(result).toEqual([{ id: "o1" }]);
    expect(db.organization.findMany.mock.calls[0]![0].where).toEqual({ status: "APPROVED" });
  });

  it("needs a signed-in fan to like", async () => {
    const caller = createCallerFactory(appRouter)(make({}, "app", null));
    await expect(
      caller.gallery.like({ organizationId: "o1", slotId: "m-front-0", roomIndex: 0 }),
    ).rejects.toThrow();
  });

  it("rejects a slot that doesn't exist before touching the database", async () => {
    const caller = createCallerFactory(appRouter)(make({}, "app", fan));
    await expect(
      caller.gallery.like({ organizationId: "o1", slotId: "m-front-9", roomIndex: 0 }),
    ).rejects.toThrow();
  });
});

describe("gallery (artist)", () => {
  const artistDb = (status = "APPROVED") => ({
    organization: { findUnique: vi.fn().mockResolvedValue({ id: "org1", status }) },
    museumRoom: { findUnique: vi.fn() },
    gallerySlotOverride: {
      upsert: vi.fn().mockResolvedValue({ id: "s1" }),
      findMany: vi.fn().mockResolvedValue([]),
    },
  });

  it("hangs a picture in the signed-in artist's own museum", async () => {
    const db = artistDb();
    const caller = createCallerFactory(portalRouter)(make(db, "org", fan));
    await caller.gallery.saveSlot({
      slotId: "m-east-near",
      imageUrl: "https://cdn.test/a.png",
      title: "Dawn",
    });
    expect(db.gallerySlotOverride.upsert.mock.calls[0]![0].create).toMatchObject({
      organizationId: "org1",
      slotId: "m-east-near",
      roomIndex: 0,
    });
  });

  it("refuses plain-http pictures and people who aren't approved artists", async () => {
    const caller = createCallerFactory(portalRouter)(make(artistDb(), "org", fan));
    await expect(
      caller.gallery.saveSlot({ slotId: "m-east-near", imageUrl: "http://cdn.test/a.png" }),
    ).rejects.toThrow();
    const pending = createCallerFactory(portalRouter)(make(artistDb("PENDING"), "org", fan));
    await expect(pending.gallery.saveSlot({ slotId: "m-east-near" })).rejects.toThrow(
      /waiting for approval/,
    );
  });
});
